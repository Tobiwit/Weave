import type { Song } from '../../types';
import { getSpotifyToken, isSpotifyConfigured } from './auth';

/**
 * Spotify import boundary.
 *
 * Spotify is an adapter into a library, never the analytical foundation.
 * It supplies track identity only — title, artist, album, year, cover — and
 * Weave then reads those songs with its own sources. No Spotify content enters
 * the embedding pipeline, and the app is fully usable without it.
 *
 * Reads use the listener's own token, obtained by PKCE in the browser. An app
 * token was tried first and cannot do this: measured against a real playlist,
 * `/playlists/{id}/tracks` returns 403 and the playlist object comes back with
 * its `tracks` key stripped entirely.
 */

export * from './auth';

export interface ImportedTrack extends Song {
  spotifyId?: string;
}

export interface ImportedPlaylist {
  name: string;
  description: string;
  coverUrl?: string;
  tracks: ImportedTrack[];
  /** True when the playlist was longer than the import cap. */
  truncated: boolean;
}

export class SpotifyImportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SpotifyImportError';
    this.code = code;
  }
}

const MAX_TRACKS = 500;

export function isSpotifyImportAvailable(): boolean {
  return isSpotifyConfigured();
}

/** Recognises share links, embed links and `spotify:playlist:` URIs. */
export function looksLikePlaylistLink(input: string): boolean {
  return parsePlaylistId(input) !== null;
}

export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();

  const uri = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uri) return uri[1];

  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith('spotify.com')) return null;
    const match = url.pathname.match(/playlist\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return /^[A-Za-z0-9]{16,40}$/.test(trimmed) ? trimmed : null;
  }
}

/**
 * The market to ask about. Availability then matches what this listener would
 * actually see, and track objects come back populated rather than null.
 */
function marketFromLocale(): string {
  const locale = typeof navigator !== 'undefined' ? navigator.language : '';
  const region = locale.split('-')[1];
  return /^[A-Za-z]{2}$/.test(region ?? '') ? region.toUpperCase() : 'US';
}

/** A stable local id, so re-importing the same playlist does not duplicate songs. */
function songIdFor(track: { spotifyId?: string; title: string; artist: string }): string {
  if (track.spotifyId) return `sp_${track.spotifyId}`;
  let hash = 2166136261;
  const key = `${track.artist}::${track.title}`.toLowerCase();
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sp_x${(hash >>> 0).toString(36)}`;
}

interface SpotifyImage {
  url: string;
  width: number | null;
}

interface SpotifyTrack {
  id?: string | null;
  name?: string;
  artists?: { name: string }[];
  album?: { name?: string; release_date?: string; images?: SpotifyImage[] };
}

/** A track that carries the two fields an import cannot do without. */
type ReadableTrack = SpotifyTrack & { name: string; artists: { name: string }[] };

function pickCover(images?: SpotifyImage[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
}

/**
 * The track inside a playlist entry.
 *
 * The documented shape wraps it as `{ track: {...} }`; the shape actually
 * observed wraps it as `{ item: {...} }`, matching the same rename that turned
 * the page's `tracks` into `items`. Both are tried, then the entry itself, and
 * finally any property that looks like a track — so another rename degrades
 * into still working rather than into an empty import.
 *
 * A track is only usable if it has a name and at least one artist, which is
 * also what distinguishes it from the booleans and flags sitting alongside it.
 */
function trackOf(entry: unknown): ReadableTrack | null {
  if (!entry || typeof entry !== 'object') return null;

  const readable = (value: unknown): ReadableTrack | null => {
    const track = value as SpotifyTrack | undefined;
    return track?.name && track.artists?.length ? (track as ReadableTrack) : null;
  };

  const record = entry as Record<string, unknown>;
  for (const candidate of [record.track, record.item, entry]) {
    const track = readable(candidate);
    if (track) return track;
  }

  // Last resort: whichever property actually carries a track.
  for (const value of Object.values(record)) {
    const track = readable(value);
    if (track) return track;
  }
  return null;
}

interface TrackPage {
  items?: { track?: SpotifyTrack }[];
  next?: string | null;
  total?: number | null;
}

/**
 * Finds the track list in a playlist response, whatever shape it arrived in.
 *
 * Spotify has been observed returning the documented `tracks` paging object,
 * a bare top-level `items` array, and an `items` paging object with no `tracks`
 * key at all. Reading one fixed path silently produces zero tracks, which is
 * indistinguishable from an empty playlist, so this looks for the array rather
 * than assuming where it lives.
 */
function trackPageOf(payload: Record<string, unknown> | null | undefined): TrackPage {
  const asPage = (value: unknown): TrackPage | null => {
    if (Array.isArray(value)) {
      return { items: value as TrackPage['items'], next: null, total: value.length };
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.items)) {
        return {
          items: record.items as TrackPage['items'],
          next: (record.next as string | null) ?? null,
          total: (record.total as number | null) ?? null,
        };
      }
    }
    return null;
  };

  for (const key of ['tracks', 'items']) {
    const page = asPage(payload?.[key]);
    if (page) return page;
  }
  return {};
}

/** The track count from whichever shape this summary arrived in. */
function totalOf(payload: Record<string, unknown> | null | undefined): number | null {
  const page = trackPageOf(payload);
  if (typeof page.total === 'number') return page.total;
  if (page.items) return page.items.length;
  const direct = payload?.total;
  return typeof direct === 'number' ? direct : null;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  /** Null when Spotify did not report one, rather than a misleading zero. */
  trackCount: number | null;
  coverUrl?: string;
  owner?: string;
}

/**
 * The signed-in listener's own playlists.
 *
 * Being connected makes pasting a link unnecessary for your own playlists, and
 * a list you can tap is a far better affordance than a URL field.
 */
export async function listMyPlaylists(limit = 50): Promise<PlaylistSummary[]> {
  const token = await getSpotifyToken();
  if (!token) {
    throw new SpotifyImportError('not_connected', 'Connect your Spotify account first.');
  }

  const auth = { Authorization: `Bearer ${token}` };
  const out: PlaylistSummary[] = [];
  let next: string | null =
    `https://api.spotify.com/v1/me/playlists?limit=${Math.min(50, limit)}`;

  while (next && out.length < limit) {
    const response: Response = await fetch(next, { headers: auth });
    if (response.status === 401) {
      throw new SpotifyImportError(
        'not_connected',
        'Your Spotify connection expired. Connect again.',
      );
    }
    if (!response.ok) {
      throw new SpotifyImportError(
        'upstream',
        'Spotify is not answering right now. Try again in a moment.',
      );
    }

    const body = await response.json();
    for (const item of body.items ?? []) {
      // A deleted playlist can still appear in the list as a null entry.
      if (!item?.id || !item?.name) continue;
      out.push({
        id: item.id,
        name: item.name,
        trackCount: totalOf(item),
        coverUrl: pickCover(item.images),
        owner: item.owner?.display_name,
      });
      if (out.length >= limit) break;
    }
    next = body.next ?? null;
  }

  return out;
}

export async function importPublicPlaylist(url: string): Promise<ImportedPlaylist> {
  const playlistId = parsePlaylistId(url);
  if (!playlistId) {
    throw new SpotifyImportError(
      'bad_link',
      'That does not look like a Spotify playlist link.',
    );
  }

  const token = await getSpotifyToken();
  if (!token) {
    throw new SpotifyImportError('not_connected', 'Connect your Spotify account first.');
  }

  const auth = { Authorization: `Bearer ${token}` };
  const market = marketFromLocale();

  const meta = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?market=${market}`,
    { headers: auth },
  );

  if (meta.status === 404) {
    throw new SpotifyImportError(
      'not_found',
      'We could not find that playlist. Is the link right?',
    );
  }
  if (meta.status === 401) {
    throw new SpotifyImportError(
      'not_connected',
      'Your Spotify connection expired. Connect again.',
    );
  }
  if (meta.status === 403) {
    throw new SpotifyImportError(
      'forbidden',
      'Spotify would not open that playlist for your account.',
    );
  }
  if (!meta.ok) {
    throw new SpotifyImportError(
      'upstream',
      'Spotify is not answering right now. Try again in a moment.',
    );
  }

  const playlist = await meta.json();

  const tracks: ImportedTrack[] = [];
  let skipped = 0;
  let truncated = false;
  let firstSkipped: unknown = null;

  const collect = (items: { track?: SpotifyTrack }[] | undefined) => {
    for (const item of items ?? []) {
      const track = trackOf(item);
      // Local files and removed tracks arrive as null or without a name.
      if (!track) {
        skipped += 1;
        if (!firstSkipped) firstSkipped = item;
        continue;
      }
      const year = track.album?.release_date
        ? Number(String(track.album.release_date).slice(0, 4))
        : undefined;
      const identity = {
        spotifyId: track.id ?? undefined,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(', '),
      };
      tracks.push({
        ...identity,
        id: songIdFor(identity),
        album: track.album?.name,
        year: Number.isFinite(year) ? year : undefined,
        artworkUrl: pickCover(track.album?.images),
        source: 'spotify',
      });
      if (tracks.length >= MAX_TRACKS) return;
    }
  };

  const firstPage = trackPageOf(playlist);
  collect(firstPage.items);

  let next: string | null = firstPage.next ?? null;
  while (next && tracks.length < MAX_TRACKS) {
    const page = await fetch(next, { headers: auth });
    if (!page.ok) {
      // Keep what we have rather than losing the whole import to one bad page.
      truncated = true;
      break;
    }
    const body = await page.json();
    const nextPage = trackPageOf(body);
    collect(nextPage.items);
    next = nextPage.next ?? null;
  }

  if (tracks.length === 0) {
    // Nothing came back and nothing was skipped means the response did not
    // carry tracks at all, which is a very different problem from a playlist
    // full of unavailable songs. Report the shape so the cause is visible
    // rather than inferred.
    if (skipped === 0) {
      // Dump the actual structure, not just the keys: the last two rounds of
      // this were both a wrong assumption about where the array lives.
      const describe = (value: unknown): unknown => {
        if (Array.isArray(value)) return `array(${value.length})`;
        if (value && typeof value === 'object') return Object.keys(value);
        return typeof value;
      };
      console.warn('[weave] Spotify returned no tracks', {
        playlistId,
        market,
        responseKeys: Object.keys(playlist ?? {}),
        tracksShape: describe(playlist?.tracks),
        itemsShape: describe(playlist?.items),
        sample: JSON.stringify(playlist?.items ?? playlist?.tracks ?? null).slice(0, 400),
      });
    }
    if (skipped > 0) {
      // Everything being unreadable is far more likely to be an unexpected item
      // shape than a whole playlist unavailable in one country, so show what an
      // item actually looked like.
      console.warn('[weave] Spotify items were all unreadable', {
        playlistId,
        market,
        skipped,
        itemKeys:
          firstSkipped && typeof firstSkipped === 'object'
            ? Object.keys(firstSkipped)
            : typeof firstSkipped,
        sample: JSON.stringify(firstSkipped).slice(0, 400),
      });
    }
    throw new SpotifyImportError(
      skipped > 0 ? 'all_unavailable' : 'empty',
      skipped > 0
        ? 'Those tracks came back in a form we could not read. See the console.'
        : 'That playlist returned no tracks. See the console for what came back.',
    );
  }

  return {
    name: playlist.name ?? 'Imported playlist',
    description: stripHtml(playlist.description ?? ''),
    coverUrl: pickCover(playlist.images),
    truncated: truncated || tracks.length >= MAX_TRACKS,
    tracks,
  };
}

/** Spotify playlist descriptions arrive with markup and entities in them. */
function stripHtml(value: string): string {
  const withoutTags = value.replace(/<[^>]*>/g, ' ');
  const parsed = withoutTags
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return parsed.replace(/\s+/g, ' ').trim();
}
