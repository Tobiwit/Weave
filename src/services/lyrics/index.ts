import { CATALOGUE_BY_ID } from '../../data/mockCatalogue';
import type { Song } from '../../types';
import { getRuntimeSettings } from '../runtimeSettings';

export interface LyricsProvider {
  readonly id: string;
  getLyrics(song: Song, signal?: AbortSignal): Promise<string | null>;
}

interface LrclibResponse {
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/**
 * LRCLIB is optional. Lyrics are only ever used as an internal signal for
 * semantic interpretation; the app never displays passages of them.
 */
export const lrclibProvider: LyricsProvider = {
  id: 'lrclib',
  async getLyrics(song, signal) {
    const url = new URL('https://lrclib.net/api/get');
    url.searchParams.set('track_name', song.title);
    url.searchParams.set('artist_name', song.artist);
    if (song.album) url.searchParams.set('album_name', song.album);

    const response = await fetch(url, {
      signal,
      headers: { 'Lrclib-Client': 'Weave v0.1.0 (https://github.com/Tobiwit/Weave)' },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`LRCLIB responded ${response.status}`);

    const data = (await response.json()) as LrclibResponse;
    return data.plainLyrics?.trim() ? data.plainLyrics : null;
  },
};

export const mockLyricsProvider: LyricsProvider = {
  id: 'mock',
  async getLyrics(song) {
    return CATALOGUE_BY_ID.get(song.id)?.lyricSketch ?? null;
  },
};

export async function fetchLyrics(
  song: Song,
  signal?: AbortSignal,
): Promise<{ lyrics: string | null; providerId: string }> {
  const { providerMode } = getRuntimeSettings();
  const known = CATALOGUE_BY_ID.has(song.id);

  if (providerMode === 'mock' || known) {
    return { lyrics: await mockLyricsProvider.getLyrics(song, signal), providerId: 'mock' };
  }
  return { lyrics: await lrclibProvider.getLyrics(song, signal), providerId: 'lrclib' };
}
