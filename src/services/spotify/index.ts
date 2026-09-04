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
  not_configured: 'Spotify import is not set up for this build yet.',
  unavailable: 'Spotify import is not set up for this build yet.',
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
    body: { url: url.trim() },
  });

  if (error || !data) {
    throw new SpotifyImportError('upstream', MESSAGES.upstream);
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
    tracks: {
      spotifyId?: string | null;
      title: string;
      artist: string;
      album?: string;
      year?: number;
      artworkUrl?: string;
    }[];
  };

  return {
    name: payload.name,
    description: stripHtml(payload.description ?? ''),
    coverUrl: payload.coverUrl,
    truncated: Boolean(payload.truncated),
    tracks: (payload.tracks ?? []).map((track) => ({
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
