import { CATALOGUE_BY_ID } from '../../data/mockCatalogue';
import type { Song } from '../../types';
import { getRuntimeSettings } from '../runtimeSettings';

export interface MetadataResult {
  patch: Partial<Song>;
  genres: string[];
}

export interface MetadataProvider {
  readonly id: string;
  enrich(song: Song, signal?: AbortSignal): Promise<MetadataResult>;
}

/* ------------------------------ MusicBrainz ------------------------------ */

interface MbRecording {
  id: string;
  title: string;
  ['artist-credit']?: { name: string }[];
  releases?: {
    title: string;
    date?: string;
    ['release-group']?: { ['primary-type']?: string };
  }[];
  tags?: { name: string; count: number }[];
  isrcs?: string[];
}

interface MbResponse {
  recordings?: MbRecording[];
}

const MB_ENDPOINT = 'https://musicbrainz.org/ws/2/recording';

/**
 * MusicBrainz asks for a descriptive User-Agent and rate limits to roughly one
 * request per second. We send at most one lookup per analysis and never poll.
 */
const MB_HEADERS: HeadersInit = {
  Accept: 'application/json',
  'User-Agent': 'Weave/0.1.0 (https://github.com/Tobiwit/Weave)',
};

let lastMusicBrainzCall = 0;

async function respectRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastMusicBrainzCall;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastMusicBrainzCall = Date.now();
}

export const musicBrainzProvider: MetadataProvider = {
  id: 'musicbrainz',
  async enrich(song, signal) {
    await respectRateLimit();

    const query = song.mbid
      ? `rid:${song.mbid}`
      : `recording:"${song.title}" AND artist:"${song.artist}"`;
    const url = new URL(MB_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, { headers: MB_HEADERS, signal });
    if (!response.ok) throw new Error(`MusicBrainz responded ${response.status}`);

    const data = (await response.json()) as MbResponse;
    const recording = data.recordings?.[0];
    if (!recording) return { patch: {}, genres: [] };

    const release = recording.releases?.[0];
    const year = release?.date ? Number(release.date.slice(0, 4)) : undefined;

    return {
      patch: {
        mbid: recording.id,
        album: release?.title ?? song.album,
        year: Number.isFinite(year) ? year : song.year,
        isrc: recording.isrcs?.[0] ?? song.isrc,
      },
      genres: (recording.tags ?? [])
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map((tag) => tag.name),
    };
  },
};

/* --------------------------------- mock ---------------------------------- */

export const mockMetadataProvider: MetadataProvider = {
  id: 'mock',
  async enrich(song) {
    const entry = CATALOGUE_BY_ID.get(song.id);
    if (!entry) return { patch: {}, genres: [] };
    return {
      patch: {
        album: entry.song.album,
        year: entry.song.year,
      },
      genres: entry.genres,
    };
  },
};

export async function fetchMetadata(
  song: Song,
  signal?: AbortSignal,
): Promise<MetadataResult & { providerId: string }> {
  const { providerMode } = getRuntimeSettings();
  const known = CATALOGUE_BY_ID.has(song.id);

  if (providerMode === 'mock' || known) {
    const result = await mockMetadataProvider.enrich(song, signal);
    return { ...result, providerId: mockMetadataProvider.id };
  }

  const result = await musicBrainzProvider.enrich(song, signal);
  return { ...result, providerId: musicBrainzProvider.id };
}
