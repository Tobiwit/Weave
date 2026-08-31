import { readCache, writeCache } from '../../db/repositories';
import type { Song } from '../../types';
import { getRuntimeSettings } from '../runtimeSettings';

export interface ArtworkResult {
  url: string;
  /** Extra identity the lookup happened to confirm, used only to fill gaps. */
  album?: string;
  year?: number;
}

export interface ArtworkProvider {
  readonly id: string;
  find(song: Song, signal?: AbortSignal): Promise<ArtworkResult | null>;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4500;

interface ItunesTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words that mark a release as an alternate take rather than the original. */
const VARIANT =
  /\b(remix|live|instrumental|karaoke|cover|edit|version|remaster|remastered|acoustic|demo|sped up|slowed)\b/;

function scoreCandidate(track: ItunesTrack, song: Song): number {
  const wantTitle = normalise(song.title);
  const wantArtist = normalise(song.artist);
  const wantAlbum = song.album ? normalise(song.album) : '';

  const title = normalise(track.trackName ?? '');
  const artist = normalise(track.artistName ?? '');
  const album = normalise(track.collectionName ?? '');

  if (!title || !artist) return -Infinity;

  let score = 0;
  if (title === wantTitle) score += 100;
  else if (title.startsWith(wantTitle)) score += 70;
  else if (title.includes(wantTitle)) score += 40;
  else return -Infinity;

  if (artist === wantArtist) score += 50;
  else if (artist.includes(wantArtist) || wantArtist.includes(artist)) score += 30;

  // The album we already know about is the strongest signal that this is the
  // canonical release rather than a compilation or a deluxe repackage.
  if (wantAlbum && album === wantAlbum) score += 45;
  else if (wantAlbum && (album.includes(wantAlbum) || wantAlbum.includes(album))) {
    score += 25;
  }

  if (VARIANT.test(title) && !VARIANT.test(wantTitle)) score -= 60;

  // Between otherwise equal matches, the plainest title is the original.
  score -= Math.min(20, title.length / 8);

  return score;
}

/**
 * Cover art from the iTunes Search API.
 *
 * Chosen because it needs no key, sends CORS headers, and has good coverage.
 * It is used only for artwork and to fill in an album or year we do not have;
 * nothing from it enters the analytical pipeline.
 */
export const itunesArtworkProvider: ArtworkProvider = {
  id: 'itunes',
  async find(song, signal) {
    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', `${song.artist} ${song.title}`);
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '12');

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`iTunes responded ${response.status}`);

    const data = (await response.json()) as { results?: ItunesTrack[] };
    const candidates = data.results ?? [];
    if (candidates.length === 0) return null;

    let best: ItunesTrack | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, song);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best || bestScore <= 0 || !best.artworkUrl100) return null;

    const year = best.releaseDate ? Number(best.releaseDate.slice(0, 4)) : undefined;
    return {
      // The API returns a thumbnail; the same path serves any size.
      url: best.artworkUrl100.replace('100x100bb', '600x600bb'),
      album: best.collectionName,
      year: Number.isFinite(year) ? year : undefined,
    };
  },
};

/** Aborts the lookup if it outlives its usefulness, or if the caller cancels. */
function withTimeout(signal?: AbortSignal): {
  signal: AbortSignal;
  done: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward);

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}

/**
 * Finds cover art for a song, cached across runs.
 *
 * Never throws: artwork is a nicety, and the generated cover is a perfectly
 * good fallback. A negative result is cached too, so a song with no art is not
 * looked up again on every analysis.
 */
export async function fetchArtwork(
  song: Song,
  signal?: AbortSignal,
): Promise<{ artwork: ArtworkResult | null; providerId: string }> {
  if (getRuntimeSettings().providerMode === 'mock') {
    return { artwork: null, providerId: 'none' };
  }

  const cacheKey = `artwork:${song.id}`;
  const cached = await readCache<ArtworkResult | null>(cacheKey, CACHE_TTL_MS);
  if (cached !== undefined) {
    return { artwork: cached, providerId: 'cache' };
  }

  const { signal: timed, done } = withTimeout(signal);
  try {
    const artwork = await itunesArtworkProvider.find(song, timed);
    await writeCache(cacheKey, artwork).catch(() => undefined);
    return { artwork, providerId: itunesArtworkProvider.id };
  } catch {
    return { artwork: null, providerId: itunesArtworkProvider.id };
  } finally {
    done();
  }
}
