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

function pickCover(images?: SpotifyImage[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
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
        trackCount: item.tracks?.total ?? 0,
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

  const collect = (items: { track?: SpotifyTrack }[] | undefined) => {
    for (const item of items ?? []) {
      const track = item?.track;
      // Local files and removed tracks arrive as null or without a name.
      if (!track?.name || !track.artists?.length) {
        skipped += 1;
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

  collect(playlist.tracks?.items);

  let next: string | null = playlist.tracks?.next ?? null;
  while (next && tracks.length < MAX_TRACKS) {
    const page = await fetch(next, { headers: auth });
    if (!page.ok) {
      // Keep what we have rather than losing the whole import to one bad page.
      truncated = true;
      break;
    }
    const body = await page.json();
    collect(body.items);
    next = body.next ?? null;
  }

  if (tracks.length === 0) {
    // Nothing came back and nothing was skipped means the response did not
    // carry tracks at all, which is a very different problem from a playlist
    // full of unavailable songs. Report the shape so the cause is visible
    // rather than inferred.
    if (skipped === 0) {
      console.warn('[weave] Spotify returned no tracks', {
        playlistId,
        market,
        responseKeys: Object.keys(playlist ?? {}),
        hasTracksKey: 'tracks' in (playlist ?? {}),
        trackTotal: playlist?.tracks?.total ?? null,
        itemCount: playlist?.tracks?.items?.length ?? null,
      });
    }
    throw new SpotifyImportError(
      skipped > 0 ? 'all_unavailable' : 'empty',
      skipped > 0
        ? 'None of those tracks are available in your region, so there is nothing to bring across.'
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
