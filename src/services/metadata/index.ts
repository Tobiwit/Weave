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

interface MbRelease {
  title: string;
  date?: string;
  ['release-group']?: {
    ['primary-type']?: string;
    ['secondary-types']?: string[];
  };
}

export interface MbRecording {
  id: string;
  title: string;
  score?: number;
  ['first-release-date']?: string;
  ['artist-credit']?: { name: string }[];
  releases?: MbRelease[];
  tags?: { name: string; count: number }[];
  isrcs?: string[];
}

interface MbResponse {
  recordings?: MbRecording[];
}

const MB_ENDPOINT = 'https://musicbrainz.org/ws/2/recording';

/* ----------------------- choosing among recordings ------------------------ */

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words that mark a recording as an alternate take rather than the song. */
const VARIANT =
  /\b(remix|live|instrumental|karaoke|cover|edit|version|acapella|a cappella|demo|sped up|slowed|mix|rework|acoustic)\b/;

const yearOf = (date?: string) => {
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(year) ? year : undefined;
};

/**
 * Whether a recording is the same song, not a remix, live take or cover.
 *
 * MusicBrainz holds one recording per mastering, re-release and compilation
 * it has been told about, and its search scores them all identically. Only
 * the ones that are genuinely the song are worth pooling.
 */
export function isSameSong(recording: MbRecording, song: Song): boolean {
  const title = normalise(recording.title);
  const wanted = normalise(song.title);
  if (title !== wanted) return false;
  if (VARIANT.test(title) && !VARIANT.test(wanted)) return false;
  const artist = normalise(song.artist);
  return (recording['artist-credit'] ?? []).some((credit) => {
    const name = normalise(credit.name);
    return name === artist || name.includes(artist) || artist.includes(name);
  });
}

/**
 * Ranks equivalent recordings so the canonical one comes first.
 *
 * Earliest release wins, then the one on the most releases, then the one on a
 * proper album. Live albums and compilations count against it. These are the
 * signs MusicBrainz leaves of which recording is the original.
 */
export function rankRecordings(recordings: MbRecording[]): MbRecording[] {
  const years = recordings
    .map((r) => yearOf(r['first-release-date']))
    .filter((y): y is number => y !== undefined);
  const earliest = years.length ? Math.min(...years) : undefined;

  const score = (r: MbRecording) => {
    let value = 0;
    const year = yearOf(r['first-release-date']);
    if (year !== undefined && earliest !== undefined) {
      value += 40 - Math.min(40, (year - earliest) * 8);
    }
    const releases = r.releases ?? [];
    value += Math.min(20, releases.length * 2);
    if (releases.some((rel) => rel['release-group']?.['primary-type'] === 'Album')) value += 10;
    const secondary = releases.flatMap((rel) => rel['release-group']?.['secondary-types'] ?? []);
    if (secondary.includes('Live')) value -= 30;
    if (releases.length > 0 && secondary.length >= releases.length) value -= 10;
    if (r.isrcs?.length) value += 10;
    value += Math.min(9, (r.tags?.length ?? 0) * 3);
    return value;
  };

  return [...recordings].sort((a, b) => score(b) - score(a));
}

/** The release to name as the song's album: an original studio album first. */
function canonicalRelease(recordings: MbRecording[]): MbRelease | undefined {
  const releases = recordings.flatMap((r) => r.releases ?? []);
  const plain = releases.filter(
    (rel) => !(rel['release-group']?.['secondary-types']?.length ?? 0),
  );
  const pick = (pool: MbRelease[], type: string) =>
    pool
      .filter((rel) => rel['release-group']?.['primary-type'] === type)
      .sort((a, b) => (yearOf(a.date) ?? 9999) - (yearOf(b.date) ?? 9999))[0];
  return pick(plain, 'Album') ?? pick(plain, 'Single') ?? releases[0];
}

/** Genres pooled across equivalent recordings, by total vote count. */
function pooledGenres(recordings: MbRecording[]): string[] {
  const votes = new Map<string, number>();
  for (const recording of recordings) {
    for (const tag of recording.tags ?? []) {
      votes.set(tag.name, (votes.get(tag.name) ?? 0) + tag.count);
    }
  }
  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

const unique = (values: (string | undefined)[], limit: number) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].slice(0, limit);

/** Everything a set of equivalent recordings says, folded into one patch. */
export function foldRecordings(recordings: MbRecording[], song: Song): MetadataResult {
  const ranked = rankRecordings(recordings);
  const best = ranked[0];
  if (!best) return { patch: {}, genres: [] };

  const release = canonicalRelease(ranked);
  const years = ranked
    .map((r) => yearOf(r['first-release-date']))
    .filter((y): y is number => y !== undefined);
  const isrcs = unique(ranked.flatMap((r) => r.isrcs ?? []), 10);

  return {
    patch: {
      mbid: best.id,
      album: release?.title ?? song.album,
      year: years.length ? Math.min(...years) : song.year,
      isrc: best.isrcs?.[0] ?? isrcs[0] ?? song.isrc,
      altIsrcs: isrcs,
      altMbids: unique(ranked.map((r) => r.id), 10),
    },
    genres: pooledGenres(ranked),
  };
}

/**
 * MusicBrainz asks for a descriptive User-Agent and rate limits to roughly one
 * request per second. We send at most one lookup per analysis and never poll.
 */
const MB_HEADERS: HeadersInit = {
  Accept: 'application/json',
  'User-Agent': 'Weave/0.1.0 (https://github.com/Tobiwit/Weave)',
};

const MB_MIN_INTERVAL_MS = 1100;

let lastMusicBrainzCall = 0;
let musicBrainzGate: Promise<void> = Promise.resolve();

/**
 * Waits for this caller's turn, then for the rest of the interval.
 *
 * Callers queue behind one another rather than each measuring the gap for
 * itself: two concurrent lookups reading the same timestamp would both find
 * the same gap, both wait it out, and then fire together, which is the one
 * thing the limit exists to prevent. Chaining makes the read and the write one
 * uninterrupted step. An idle app still pays nothing — the first call through
 * finds the interval long since elapsed and goes straight out.
 */
function respectRateLimit(): Promise<void> {
  const turn = musicBrainzGate.then(async () => {
    const wait = MB_MIN_INTERVAL_MS - (Date.now() - lastMusicBrainzCall);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastMusicBrainzCall = Date.now();
  });
  // A rejected turn must not wedge the queue for everyone behind it.
  musicBrainzGate = turn.catch(() => undefined);
  return turn;
}

async function searchRecordings(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<MbRecording[]> {
  await respectRateLimit();
  const url = new URL(MB_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url, { headers: MB_HEADERS, signal });
  if (!response.ok) throw new Error(`MusicBrainz responded ${response.status}`);
  const data = (await response.json()) as MbResponse;
  return data.recordings ?? [];
}

export const musicBrainzProvider: MetadataProvider = {
  id: 'musicbrainz',
  async enrich(song, signal) {
    // One name search finds every recording of the song MusicBrainz has, and
    // they are pooled rather than the first being trusted: all of them score
    // the same, and the first is as often a remix or a live take as not.
    const byName = await searchRecordings(
      `recording:"${song.title}" AND artist:"${song.artist}"`,
      15,
      signal,
    );
    let same = byName.filter((recording) => isSameSong(recording, song));

    // A recording id from Last.fm is only consulted when the name finds
    // nothing. Those ids are often stale, and trusting one first is how a
    // remix single ended up standing in for the song.
    if (same.length === 0 && song.mbid) {
      same = await searchRecordings(`rid:${song.mbid}`, 1, signal);
    }
    if (same.length === 0) return { patch: {}, genres: [] };
    return foldRecordings(same, song);
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
