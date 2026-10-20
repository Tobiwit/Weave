import { CATALOGUE_BY_ID } from '../../data/mockCatalogue';
import { readCache, writeCache } from '../../db/repositories';
import type {
  AcousticBrainzFeatures,
  AudioEvidence,
  ReccoBeatsFeatures,
  Song,
  TraceEntry,
} from '../../types';
import { getRuntimeSettings } from '../runtimeSettings';

/**
 * Measured audio characteristics.
 *
 * Two live sources, asked independently and both kept, because they measure
 * different things and fusion wants every opinion:
 *
 * - ReccoBeats serves Spotify-style features (valence, energy, danceability,
 *   acousticness, loudness, tempo…). Found by Spotify id for imported songs and
 *   by ISRC otherwise. No key, sends CORS headers, coverage has gaps.
 * - AcousticBrainz serves Essentia classifier outputs (happy, sad, relaxed,
 *   aggressive, danceable…) by MusicBrainz recording id. Collection stopped in
 *   2022, so nothing newer is there.
 *
 * Neither is ever required. A song with no measured audio is read from its
 * words alone and every downstream consumer knows it.
 */

/** A trace line before the run stamps it with a stage and a time. */
export type ProviderTrace = Omit<TraceEntry, 'stage' | 'at'>;

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

const RECCOBEATS = 'https://api.reccobeats.com/v1';
const ACOUSTICBRAINZ = 'https://acousticbrainz.org/api/v1';

/** A fetch that gives up on its own, and also when the caller does. */
async function timedJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

/** The Spotify id an imported song carries in its own id, if it has one. */
export function spotifyIdOf(song: Song): string | undefined {
  return song.id.startsWith('sp_') ? song.id.slice(3) : undefined;
}

const uniq = (values: (string | undefined)[], limit: number) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].slice(0, limit);

/** Every ISRC the song is known by, its own first. */
export function isrcsOf(song: Song): string[] {
  return uniq([song.isrc, ...(song.altIsrcs ?? [])], 10);
}

/** Every MusicBrainz recording id the song is known by, its own first. */
export function mbidsOf(song: Song): string[] {
  return uniq([song.mbid, ...(song.altMbids ?? [])], 10);
}

const round = (value: number, places = 3) =>
  Math.round(value * 10 ** places) / 10 ** places;

/* ------------------------------- ReccoBeats ------------------------------- */

interface RbFeatures {
  id: string;
  valence: number;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  loudness: number;
  tempo: number;
  key?: number;
  mode?: number;
}

interface RbTrack {
  id: string;
  isrc?: string;
}

/**
 * The track for the most canonical ISRC ReccoBeats knows.
 *
 * It answers in its own order, and the same song's live album and remaster
 * sit in the same answer. Taking the first would as soon measure the live
 * take as the record, so the order the ISRCs were ranked in decides.
 */
export function pickTrack(tracks: RbTrack[], isrcs: string[]): RbTrack | undefined {
  for (const isrc of isrcs) {
    const hit = tracks.find((track) => track.isrc === isrc);
    if (hit) return hit;
  }
  return tracks[0];
}

function toReccoBeats(
  raw: RbFeatures,
  matchedBy: ReccoBeatsFeatures['matchedBy'],
): ReccoBeatsFeatures {
  return {
    valence: raw.valence,
    energy: raw.energy,
    danceability: raw.danceability,
    acousticness: raw.acousticness,
    instrumentalness: raw.instrumentalness,
    speechiness: raw.speechiness,
    liveness: raw.liveness,
    loudness: raw.loudness,
    tempo: raw.tempo,
    key: raw.key,
    mode: raw.mode,
    matchedBy,
    trackId: raw.id,
  };
}

export async function fetchReccoBeats(
  song: Song,
  signal?: AbortSignal,
): Promise<{ features: ReccoBeatsFeatures | null; trace: ProviderTrace }> {
  const spotifyId = spotifyIdOf(song);
  const isrcs = isrcsOf(song);
  const lookup = spotifyId
    ? `spotify:${spotifyId}`
    : isrcs.length
      ? `isrc:${isrcs.join(',')}`
      : null;

  if (!lookup) {
    return {
      features: null,
      trace: {
        kind: 'fetch',
        provider: 'reccobeats',
        status: 'skipped',
        note: 'No Spotify id or ISRC to look the track up by.',
      },
    };
  }

  const cacheKey = `audio:reccobeats:v2:${lookup}`;
  const cached = await readCache<ReccoBeatsFeatures | null>(cacheKey, CACHE_TTL_MS);
  if (cached !== undefined) {
    return {
      features: cached,
      trace: {
        kind: 'fetch',
        provider: 'reccobeats',
        request: lookup,
        status: 'cached',
        output: cached ? summariseReccoBeats(cached) : { result: 'not in catalogue' },
      },
    };
  }

  const started = performance.now();
  let request = '';
  try {
    let raw: RbFeatures | undefined;
    if (spotifyId) {
      request = `GET /audio-features?ids=${spotifyId}`;
      const data = await timedJson<{ content?: RbFeatures[] }>(
        `${RECCOBEATS}/audio-features?ids=${encodeURIComponent(spotifyId)}`,
        signal,
      );
      raw = data.content?.[0];
    } else {
      // Every pressing at once: ReccoBeats knows some ISRCs of a song and not
      // others, and returns whichever it has.
      request = `GET /track?ids=${isrcs.length} ISRCs → /track/{id}/audio-features`;
      const tracks = await timedJson<{ content?: RbTrack[] }>(
        `${RECCOBEATS}/track?ids=${isrcs.map(encodeURIComponent).join(',')}`,
        signal,
      );
      const trackId = pickTrack(tracks.content ?? [], isrcs)?.id;
      if (trackId) {
        raw = await timedJson<RbFeatures>(
          `${RECCOBEATS}/track/${encodeURIComponent(trackId)}/audio-features`,
          signal,
        );
      }
    }

    const features = raw ? toReccoBeats(raw, spotifyId ? 'spotify' : 'isrc') : null;
    await writeCache(cacheKey, features).catch(() => undefined);
    return {
      features,
      trace: {
        kind: 'fetch',
        provider: 'reccobeats',
        request,
        status: features ? 'ok' : 'empty',
        ms: Math.round(performance.now() - started),
        output: features ? summariseReccoBeats(features) : { result: 'not in catalogue' },
      },
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError' && signal?.aborted) throw error;
    return {
      features: null,
      trace: {
        kind: 'fetch',
        provider: 'reccobeats',
        request,
        status: 'error',
        ms: Math.round(performance.now() - started),
        note: (error as Error).message,
      },
    };
  }
}

function summariseReccoBeats(f: ReccoBeatsFeatures): Record<string, number | string> {
  return {
    valence: round(f.valence),
    energy: round(f.energy),
    danceability: round(f.danceability),
    acousticness: round(f.acousticness),
    instrumentalness: round(f.instrumentalness),
    speechiness: round(f.speechiness),
    liveness: round(f.liveness),
    loudness: `${round(f.loudness, 1)} dB`,
    tempo: `${Math.round(f.tempo)} BPM`,
    matchedBy: f.matchedBy,
  };
}

/* ----------------------------- AcousticBrainz ----------------------------- */

interface AbClass {
  all?: Record<string, number>;
}

type AbHighLevel = Record<string, Record<string, { highlevel?: Record<string, AbClass> }>>;
type AbLowLevel = Record<string, Record<string, { rhythm?: { bpm?: number } }>>;

function probability(highlevel: Record<string, AbClass>, model: string, label: string) {
  const value = highlevel[model]?.all?.[label];
  return typeof value === 'number' ? value : undefined;
}

export function parseAcousticBrainz(
  mbid: string,
  high: AbHighLevel,
  low?: AbLowLevel,
): AcousticBrainzFeatures | null {
  const submissions = high[mbid];
  const highlevel = submissions?.['0']?.highlevel;
  if (!highlevel) return null;
  return {
    mbid,
    danceable: probability(highlevel, 'danceability', 'danceable'),
    happy: probability(highlevel, 'mood_happy', 'happy'),
    sad: probability(highlevel, 'mood_sad', 'sad'),
    aggressive: probability(highlevel, 'mood_aggressive', 'aggressive'),
    relaxed: probability(highlevel, 'mood_relaxed', 'relaxed'),
    party: probability(highlevel, 'mood_party', 'party'),
    acoustic: probability(highlevel, 'mood_acoustic', 'acoustic'),
    electronic: probability(highlevel, 'mood_electronic', 'electronic'),
    bright: probability(highlevel, 'timbre', 'bright'),
    bpm: low?.[mbid]?.['0']?.rhythm?.bpm,
    submissions: Object.keys(submissions).length,
  };
}

export async function fetchAcousticBrainz(
  song: Song,
  signal?: AbortSignal,
): Promise<{ features: AcousticBrainzFeatures | null; trace: ProviderTrace }> {
  const mbids = mbidsOf(song);
  if (mbids.length === 0) {
    return {
      features: null,
      trace: {
        kind: 'fetch',
        provider: 'acousticbrainz',
        status: 'skipped',
        note: 'No MusicBrainz recording id to look the track up by.',
      },
    };
  }

  const cacheKey = `audio:acousticbrainz:v2:${mbids.join(',')}`;
  const cached = await readCache<AcousticBrainzFeatures | null>(cacheKey, CACHE_TTL_MS);
  if (cached !== undefined) {
    return {
      features: cached,
      trace: {
        kind: 'fetch',
        provider: 'acousticbrainz',
        request: `${mbids.length} recording ids`,
        status: 'cached',
        output: cached ? summariseAcousticBrainz(cached) : { result: 'never submitted' },
      },
    };
  }

  const started = performance.now();
  const request = `GET /high-level for ${mbids.length} recording ids, /low-level bpm for the first found`;
  try {
    const high = await timedJson<AbHighLevel>(
      `${ACOUSTICBRAINZ}/high-level?recording_ids=${mbids.map(encodeURIComponent).join(';')}`,
      signal,
    );
    // The canonical recording first; any equivalent one will do.
    const found = mbids.find((id) => high[id]?.['0']?.highlevel);
    const low = found
      ? await timedJson<AbLowLevel>(
          `${ACOUSTICBRAINZ}/low-level?recording_ids=${encodeURIComponent(found)}&features=rhythm.bpm`,
          signal,
        ).catch(() => undefined)
      : undefined;
    const features = found ? parseAcousticBrainz(found, high, low) : null;
    await writeCache(cacheKey, features).catch(() => undefined);
    return {
      features,
      trace: {
        kind: 'fetch',
        provider: 'acousticbrainz',
        request,
        status: features ? 'ok' : 'empty',
        ms: Math.round(performance.now() - started),
        output: features ? summariseAcousticBrainz(features) : { result: 'never submitted' },
      },
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError' && signal?.aborted) throw error;
    return {
      features: null,
      trace: {
        kind: 'fetch',
        provider: 'acousticbrainz',
        request,
        status: 'error',
        ms: Math.round(performance.now() - started),
        note: (error as Error).message,
      },
    };
  }
}

function summariseAcousticBrainz(f: AcousticBrainzFeatures): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const key of [
    'danceable',
    'happy',
    'sad',
    'aggressive',
    'relaxed',
    'party',
    'acoustic',
    'electronic',
    'bright',
  ] as const) {
    const value = f[key];
    if (typeof value === 'number') out[key] = round(value);
  }
  if (typeof f.bpm === 'number') out.bpm = `${Math.round(f.bpm)} BPM`;
  out.submissions = f.submissions ?? 1;
  out.mbid = f.mbid;
  return out;
}

/* ---------------------------------- all ----------------------------------- */

export interface AudioResult {
  audio: AudioEvidence;
  traces: ProviderTrace[];
}

/**
 * Asks every audio source that can be asked, in parallel.
 *
 * The development catalogue answers for its own songs without the network.
 * In mock mode nothing live is asked at all.
 */
export async function fetchAudioEvidence(
  song: Song,
  signal?: AbortSignal,
): Promise<AudioResult> {
  const entry = CATALOGUE_BY_ID.get(song.id);
  if (entry) {
    const mock = {
      energy: entry.energy,
      brightness: entry.brightness,
      danceability: entry.danceability,
      acousticness: entry.acousticness,
      bpm: entry.bpm,
    };
    return {
      audio: { mock, checkedAt: Date.now() },
      traces: [
        {
          kind: 'fetch',
          provider: 'mock',
          request: `catalogue:${song.id}`,
          status: 'ok',
          output: Object.fromEntries(
            Object.entries(mock).filter(([, v]) => typeof v === 'number'),
          ) as Record<string, number>,
        },
      ],
    };
  }

  if (getRuntimeSettings().providerMode === 'mock') {
    const skipped = (provider: string): ProviderTrace => ({
      kind: 'fetch',
      provider,
      status: 'skipped',
      note: 'Mock mode: live sources are not asked.',
    });
    return {
      audio: { checkedAt: Date.now() },
      traces: [skipped('reccobeats'), skipped('acousticbrainz')],
    };
  }

  const [recco, acoustic] = await Promise.all([
    fetchReccoBeats(song, signal),
    fetchAcousticBrainz(song, signal),
  ]);

  return {
    audio: {
      reccobeats: recco.features ?? undefined,
      acousticbrainz: acoustic.features ?? undefined,
      checkedAt: Date.now(),
    },
    traces: [recco.trace, acoustic.trace],
  };
}

/** Names of the numeric profile fields the evidence actually measured. */
export function measuredFieldsFrom(audio: AudioEvidence | null | undefined): string[] {
  if (!audio) return [];
  const fields = new Set<string>();
  if (audio.reccobeats) {
    for (const field of ['energy', 'brightness', 'danceability', 'acousticness', 'bpm']) {
      fields.add(field);
    }
  }
  if (audio.acousticbrainz) {
    if (typeof audio.acousticbrainz.danceable === 'number') fields.add('danceability');
    if (typeof audio.acousticbrainz.happy === 'number') fields.add('brightness');
    if (typeof audio.acousticbrainz.acoustic === 'number') fields.add('acousticness');
    if (typeof audio.acousticbrainz.bpm === 'number') fields.add('bpm');
  }
  if (audio.mock) {
    for (const [key, value] of Object.entries(audio.mock)) {
      if (typeof value === 'number') fields.add(key);
    }
  }
  return [...fields];
}

/**
 * The flat numbers older parts of the app read straight off a profile, taken
 * from the most trusted source that has each one.
 */
export function flatFeaturesFrom(audio: AudioEvidence | undefined): {
  energy?: number;
  brightness?: number;
  danceability?: number;
  acousticness?: number;
  bpm?: number;
} {
  if (!audio) return {};
  const r = audio.reccobeats;
  const a = audio.acousticbrainz;
  const m = audio.mock;
  return {
    energy: r?.energy ?? m?.energy,
    // Valence is the nearest measured thing to how bright a song feels.
    brightness: r?.valence ?? m?.brightness ?? a?.happy,
    danceability: r?.danceability ?? m?.danceability ?? a?.danceable,
    acousticness: r?.acousticness ?? m?.acousticness ?? a?.acoustic,
    bpm: r?.tempo ?? m?.bpm ?? a?.bpm,
  };
}
