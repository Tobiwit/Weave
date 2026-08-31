import type { Song } from '../../types';
import { isLastfmConfigured } from '../lastfm/client';
import { getRuntimeSettings } from '../runtimeSettings';
import { lastfmSearchProvider } from './lastfmSearchProvider';
import { mockSearchProvider } from './mockSearchProvider';
import type { SongSearchProvider } from './types';

export type { SongSearchProvider } from './types';
export { mockSearchProvider } from './mockSearchProvider';

export interface SearchOutcome {
  songs: Song[];
  providerId: string;
  /** True when a live provider was tried and could not answer. */
  degraded: boolean;
}

function activeProvider(): SongSearchProvider {
  const { providerMode } = getRuntimeSettings();
  if (providerMode === 'mock') return mockSearchProvider;
  return isLastfmConfigured() ? lastfmSearchProvider : mockSearchProvider;
}

/**
 * Searches with the configured provider and quietly falls back to the local
 * catalogue when the network cannot answer. Search must never dead-end.
 */
export async function searchSongs(
  query: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { songs: [], providerId: 'none', degraded: false };

  const provider = activeProvider();
  try {
    const songs = await provider.search(trimmed, signal);
    if (songs.length > 0 || provider.id === 'mock') {
      return { songs, providerId: provider.id, degraded: false };
    }
    return { songs, providerId: provider.id, degraded: false };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    const songs = await mockSearchProvider.search(trimmed, signal);
    return { songs, providerId: mockSearchProvider.id, degraded: true };
  }
}
