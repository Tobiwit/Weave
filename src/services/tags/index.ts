import { CATALOGUE_BY_ID } from '../../data/mockCatalogue';
import type { Song } from '../../types';
import { isLastfmConfigured, lastfmRequest } from '../lastfm/client';
import { getRuntimeSettings } from '../runtimeSettings';

export interface TagProvider {
  readonly id: string;
  getTags(song: Song, signal?: AbortSignal): Promise<string[]>;
}

interface LastfmTagResponse {
  toptags?: { tag?: { name: string; count: number }[] };
}

/** Tags Last.fm users apply constantly that carry no interpretive signal. */
const NOISE_TAGS = new Set([
  'seen live',
  'favourites',
  'favorites',
  'albums i own',
  'my music',
  'awesome',
  'love',
  'best',
  'favorite songs',
  'spotify',
  'music',
]);

function cleanTags(tags: { name: string; count: number }[]): string[] {
  return tags
    .filter((tag) => tag.count >= 8)
    .map((tag) => tag.name.trim())
    .filter((name) => name.length > 1 && !NOISE_TAGS.has(name.toLowerCase()))
    .slice(0, 14);
}

export const lastfmTagProvider: TagProvider = {
  id: 'lastfm',
  async getTags(song, signal) {
    const trackTags = await lastfmRequest<LastfmTagResponse>(
      'track.getTopTags',
      { track: song.title, artist: song.artist, autocorrect: '1' },
      signal,
    ).catch(() => ({ toptags: { tag: [] } }) as LastfmTagResponse);

    const fromTrack = cleanTags(trackTags.toptags?.tag ?? []);
    if (fromTrack.length >= 5) return fromTrack;

    // Sparse track tags are common for newer or niche songs; the artist's tags
    // are a weaker but still useful cultural signal.
    const artistTags = await lastfmRequest<LastfmTagResponse>(
      'artist.getTopTags',
      { artist: song.artist, autocorrect: '1' },
      signal,
    ).catch(() => ({ toptags: { tag: [] } }) as LastfmTagResponse);

    const fromArtist = cleanTags(artistTags.toptags?.tag ?? []).slice(0, 6);
    return [...new Set([...fromTrack, ...fromArtist])];
  },
};

export const mockTagProvider: TagProvider = {
  id: 'mock',
  async getTags(song) {
    return CATALOGUE_BY_ID.get(song.id)?.tags ?? [];
  },
};

export async function fetchCommunityTags(
  song: Song,
  signal?: AbortSignal,
): Promise<{ tags: string[]; providerId: string }> {
  const { providerMode } = getRuntimeSettings();
  const known = CATALOGUE_BY_ID.has(song.id);

  if (providerMode === 'mock' || known || !isLastfmConfigured()) {
    return { tags: await mockTagProvider.getTags(song, signal), providerId: 'mock' };
  }
  return { tags: await lastfmTagProvider.getTags(song, signal), providerId: 'lastfm' };
}
