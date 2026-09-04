import type { Song } from '../../types';
import { getCloudClient, isCloudConfigured } from '../cloud/client';

/**
 * Spotify import boundary.
 *
 * Spotify is an adapter into a library, never the analytical foundation.
 * It supplies track identity only — title, artist, album, year, cover — and
 * Weave then reads those songs with its own sources. No Spotify content enters
 * the embedding pipeline, nothing is gated behind Spotify authentication, and
 * the app is fully usable without it.
 *
 * Public playlists still need a token: every Web API endpoint returns 401
 * anonymously. The token is minted by an edge function holding the app secret,
 * so importing a link requires no Spotify login from anyone.
 */

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

const MESSAGES: Record<string, string> = {
  bad_link: 'That does not look like a Spotify playlist link.',
  not_found: 'We could not find that playlist. Is the link right?',
  not_public: 'That playlist is private. Only public links can be imported.',
  not_configured:
    'The import service is missing its Spotify keys. Set them with `supabase secrets set`.',
  unavailable: 'Spotify import is not set up for this build yet.',
  not_deployed:
    'The import service is not deployed yet. Run `supabase functions deploy spotify-playlist`.',
  upstream: 'Spotify is not answering right now. Try again in a moment.',
};

export function isSpotifyImportAvailable(): boolean {
  return isCloudConfigured();
}

/** Recognises share links, embed links and `spotify:playlist:` URIs. */
export function looksLikePlaylistLink(input: string): boolean {
  const value = input.trim();
  if (/^spotify:playlist:[A-Za-z0-9]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.hostname.endsWith('spotify.com') && /playlist\//.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * The two-letter market to ask Spotify about.
 *
 * A client-credentials token has no country of its own, and without a market
 * Spotify nulls out every track in a playlist. Sending the browser's region
 * also means availability matches what the listener would actually see.
 */
function marketFromLocale(): string {
  const locale = typeof navigator !== 'undefined' ? navigator.language : '';
  const region = locale.split('-')[1];
  return /^[A-Za-z]{2}$/.test(region ?? '') ? region.toUpperCase() : 'US';
}

/** A stable local id, so re-importing the same playlist does not duplicate songs. */
function songIdFor(track: { spotifyId?: string | null; title: string; artist: string }): string {
  if (track.spotifyId) return `sp_${track.spotifyId}`;
  let hash = 2166136261;
  const key = `${track.artist}::${track.title}`.toLowerCase();
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sp_x${(hash >>> 0).toString(36)}`;
}

export async function importPublicPlaylist(url: string): Promise<ImportedPlaylist> {
  if (!looksLikePlaylistLink(url)) {
    throw new SpotifyImportError('bad_link', MESSAGES.bad_link);
  }

  const client = await getCloudClient();
  if (!client) {
    throw new SpotifyImportError('unavailable', MESSAGES.unavailable);
  }

  const { data, error } = await client.functions.invoke('spotify-playlist', {
    body: { url: url.trim(), market: marketFromLocale() },
  });

  if (error || !data) {
    // A missing function fails at the network layer rather than returning a
    // status: its 404 carries no CORS headers, so the preflight is rejected and
    // the browser reports a bare fetch failure. Blaming Spotify for that sends
    // you looking in entirely the wrong place.
    const code = error?.name === 'FunctionsFetchError' ? 'not_deployed' : 'upstream';
    throw new SpotifyImportError(code, MESSAGES[code]);
  }
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const code = String((data as { error: string }).error);
    throw new SpotifyImportError(code, MESSAGES[code] ?? MESSAGES.upstream);
  }

  const payload = data as {
    name: string;
    description: string;
    coverUrl?: string;
    truncated?: boolean;
    skipped?: number;
    tracks: {
      spotifyId?: string | null;
      title: string;
      artist: string;
      album?: string;
      year?: number;
      artworkUrl?: string;
    }[];
  };

  const tracks = payload.tracks ?? [];
  // Everything dropped is a different problem from an empty playlist: it means
  // the tracks came back unreadable, not that there was nothing there.
  if (tracks.length === 0 && (payload.skipped ?? 0) > 0) {
    throw new SpotifyImportError(
      'all_unavailable',
      'None of those tracks are available in your region, so there is nothing to bring across.',
    );
  }

  return {
    name: payload.name,
    description: stripHtml(payload.description ?? ''),
    coverUrl: payload.coverUrl,
    truncated: Boolean(payload.truncated),
    tracks: tracks.map((track) => ({
      id: songIdFor(track),
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      artworkUrl: track.artworkUrl,
      spotifyId: track.spotifyId ?? undefined,
      source: 'spotify',
    })),
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
