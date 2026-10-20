import {
  getAllPlaylists,
  getAllSongProfiles,
  readSetting,
  savePlaylist,
  writeSetting,
} from '../../db/repositories';
import {
  fitSourceCalibration,
  setSourceCalibration,
  type SourceCalibration,
} from '../song/axisReading';
import type { Playlist } from '../../types';
import {
  bandsFromSamples,
  CALIBRATION_KEY,
  COMPONENT_ORDER,
  normalizeSimilarity,
  scoreComponents,
  setMeasuredCalibration,
  type CalibrationSet,
  type ComponentName,
  type MeasuredCalibration,
} from '../matching';
import { learnWeighting } from '../matching/weighting';
import { buildMatchingContext, candidateForSong } from './playlistEngine';

/** One song scored against one playlist, raw, with whether it is a member. */
interface PairSample {
  playlistId: string;
  member: boolean;
  raw: Partial<Record<ComponentName, number>>;
}

export interface LibraryMeasurement {
  calibration: MeasuredCalibration;
  /** Per-playlist learned emphasis, keyed by playlist id. */
  weighting: Map<string, NonNullable<Playlist['weighting']>>;
}

/**
 * Measures this library's own score bands, and each playlist's emphasis.
 *
 * Every read song is scored against every playlist, with the song taken out of
 * any playlist it belongs to, and the raw similarity of each component
 * collected. The spread of those numbers is what the 0-100 scale should be
 * built on: a band measured somewhere else will either clip at the top or
 * bunch at the bottom, and either way the score stops discriminating.
 *
 * The same pass then compares members against non-members per playlist, which
 * is what `learnWeighting` turns into per-playlist factors.
 *
 * Cost is one pass over the library with no network and no new embeddings, so
 * it is cheap enough to run whenever the library is rebuilt.
 */
export async function measureLibrary(
  playlists?: Playlist[],
): Promise<LibraryMeasurement | null> {
  const all = playlists ?? (await getAllPlaylists());
  if (all.length === 0) return null;

  const context = await buildMatchingContext(all);

  const samples = Object.fromEntries(
    COMPONENT_ORDER.map((name) => [name, [] as number[]]),
  ) as Record<ComponentName, number[]>;
  const pairs: PairSample[] = [];

  for (const playlist of all) {
    const members = new Set(playlist.songIds);
    for (const [songId, song] of context.facetsBySongId) {
      if (!song.whole.length) continue;
      const facets = candidateForSong(playlist, songId, context).facets;
      if (!facets) continue;

      // Raw similarities do not depend on weights, so the playlist's current
      // factors cannot feed back into what they are learned from.
      const { components } = scoreComponents(song, { ...facets, factors: undefined });
      const raw: PairSample['raw'] = {};
      for (const component of components) {
        if (component.similarity === null) continue;
        raw[component.name as ComponentName] = component.similarity;
        samples[component.name as ComponentName].push(component.similarity);
      }
      pairs.push({ playlistId: playlist.id, member: members.has(songId), raw });
    }
  }

  if (pairs.length === 0) return null;

  const bands = bandsFromSamples(samples);
  const weighting = learnAll(all, pairs, bands);

  return {
    calibration: { bands, samples: pairs.length, measuredAt: Date.now() },
    weighting,
  };
}

function learnAll(
  playlists: Playlist[],
  pairs: PairSample[],
  bands: CalibrationSet,
): LibraryMeasurement['weighting'] {
  const out: LibraryMeasurement['weighting'] = new Map();
  for (const playlist of playlists) {
    const inside: Partial<Record<ComponentName, number[]>> = {};
    const outside: Partial<Record<ComponentName, number[]>> = {};
    let memberCount = 0;

    for (const pair of pairs) {
      if (pair.playlistId !== playlist.id) continue;
      if (pair.member) memberCount += 1;
      const into = pair.member ? inside : outside;
      for (const [name, similarity] of Object.entries(pair.raw) as [ComponentName, number][]) {
        (into[name] ??= []).push(normalizeSimilarity(similarity, bands[name]));
      }
    }

    const learned = learnWeighting(inside, outside, memberCount);
    if (learned) out.set(playlist.id, learned);
  }
  return out;
}

/** Bands only, for callers that do not need the weighting. */
export async function measureLibraryCalibration(
  playlists?: Playlist[],
): Promise<MeasuredCalibration | null> {
  return (await measureLibrary(playlists))?.calibration ?? null;
}

/**
 * Measures, stores and puts the new bands in force, and writes each
 * playlist's learned emphasis onto it.
 */
export async function recalibrateLibrary(
  playlists?: Playlist[],
): Promise<MeasuredCalibration | null> {
  const all = playlists ?? (await getAllPlaylists());

  // Sources are put on one scale first: the bands and the per-playlist
  // weights below are measured on axis readings that depend on it.
  const sourceCalibration = fitSourceCalibration(await getAllSongProfiles());
  setSourceCalibration(sourceCalibration);
  await writeSetting(SOURCE_CALIBRATION_KEY, sourceCalibration).catch(() => undefined);

  const result = await measureLibrary(all);
  if (!result) return null;

  setMeasuredCalibration(result.calibration);
  await writeSetting(CALIBRATION_KEY, result.calibration).catch(() => undefined);

  await Promise.all(
    all.map((playlist) => {
      const weighting = result.weighting.get(playlist.id);
      // A playlist that has shrunk below the minimum loses what it had learned
      // rather than keeping factors measured on songs it no longer holds.
      if (!weighting && !playlist.weighting) return Promise.resolve();
      return savePlaylist({ ...playlist, weighting, updatedAt: Date.now() });
    }),
  );

  return result.calibration;
}

/**
 * Puts a previously measured calibration back in force.
 *
 * Called once during boot. Without it every session would fall back to the
 * shipped defaults and scores would change under the user between visits.
 */
export async function loadMeasuredCalibration(): Promise<void> {
  const stored = await readSetting<MeasuredCalibration | null>(
    CALIBRATION_KEY,
    null,
  ).catch(() => null);
  if (stored?.bands) setMeasuredCalibration(stored);

  const sources = await readSetting<SourceCalibration | null>(
    SOURCE_CALIBRATION_KEY,
    null,
  ).catch(() => null);
  if (sources) setSourceCalibration(sources);
}

/** Where each axis source's mapping onto the measured scale is kept. */
export const SOURCE_CALIBRATION_KEY = 'axes.sourceCalibration';
