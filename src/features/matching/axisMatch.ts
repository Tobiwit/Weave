import { MATCHING_CONFIG } from '../../config/matching';
import type { AxisMatchDetail } from '../../types';
import { AXES, type AxisId } from '../song/axes';
import type { AxisReadings } from '../song/axisReading';

/**
 * Matching on the eight scales.
 *
 * A playlist is described per axis by where its songs sit, robustly: the
 * confidence-weighted median and the band holding the middle half of its
 * songs. An average would let three outliers drag a dark playlist to grey; a
 * median does not move for them, and the band says how much the playlist
 * actually cares where on the axis a song lands.
 *
 * That last point is what makes the axes weigh themselves. A playlist whose
 * songs all sit between 0.7 and 0.8 on darkness is about darkness. One whose
 * songs are spread from 0.1 to 0.9 has no opinion about it, and a song
 * anywhere on that axis should neither gain nor lose much.
 */

export interface AxisBand {
  median: number;
  /** Weighted 25th and 75th percentiles. */
  low: number;
  high: number;
  /** Half the distance a song may sit from the median before losing score. */
  halfWidth: number;
  /** Sum of the observation weights the band was built from. */
  weight: number;
  /** Real songs that contributed (excluding the playlist's own words). */
  members: number;
  /** Where the playlist's keywords point on this axis, if they point anywhere. */
  stated?: number;
  /** Share of the axes component this axis carries for the playlist, 0-1. */
  importance: number;
}

export interface PlaylistAxisProfile {
  bands: Partial<Record<AxisId, AxisBand>>;
  /** Members' readings, for the nearest-songs half. */
  members: AxisReadings[];
}

interface Observation {
  value: number;
  weight: number;
}

/** The weighted value below which `p` of the total weight sits. */
export function weightedQuantile(observations: Observation[], p: number): number {
  const sorted = observations
    .filter((o) => o.weight > 0 && Number.isFinite(o.value))
    .sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return 0.5;
  const total = sorted.reduce((sum, o) => sum + o.weight, 0);
  const target = p * total;
  let running = 0;
  for (const observation of sorted) {
    running += observation.weight;
    if (running >= target) return observation.value;
  }
  return sorted[sorted.length - 1].value;
}

/** How widely an axis is spread across a set of readings: their IQR. */
export function axisSpread(readings: AxisReadings[], axis: AxisId): number {
  const observations = readings
    .map((r) => ({ value: r[axis].value, weight: r[axis].confidence }))
    .filter((o) => o.weight > 0);
  if (observations.length < 2) return 0.5;
  return weightedQuantile(observations, 0.75) - weightedQuantile(observations, 0.25);
}

export type LibrarySpread = Partial<Record<AxisId, number>>;

/** Every axis's spread across the whole library, the yardstick for tightness. */
export function librarySpread(readings: AxisReadings[]): LibrarySpread {
  const out: LibrarySpread = {};
  for (const { id } of AXES) out[id] = axisSpread(readings, id);
  return out;
}

/**
 * Builds a playlist's band on every axis it has something to say about.
 *
 * The playlist's own keywords join in as a couple of pseudo-songs placed where
 * those words point. A new playlist with two songs and the keyword "dark" then
 * has a darkness band to match against; one with forty songs barely notices
 * the words, because forty real songs outvote two imagined ones.
 */
export function buildAxisProfile(
  members: AxisReadings[],
  stated: Partial<Record<AxisId, number>> = {},
  library: LibrarySpread = {},
  config = MATCHING_CONFIG.axes,
): PlaylistAxisProfile {
  const bands: Partial<Record<AxisId, AxisBand>> = {};
  const rawImportance: Partial<Record<AxisId, number>> = {};

  for (const { id } of AXES) {
    const observations: Observation[] = members
      .map((r) => ({ value: r[id].value, weight: r[id].confidence }))
      .filter((o) => o.weight > 0);
    const memberCount = observations.length;

    const statedValue = stated[id];
    if (typeof statedValue === 'number') {
      observations.push({ value: statedValue, weight: config.keywordPseudoCount * 0.5 });
    }

    // Too little to call a shape: a band from one song is that song.
    if (memberCount < config.minMembers && statedValue === undefined) continue;
    if (observations.length === 0) continue;

    const weight = observations.reduce((sum, o) => sum + o.weight, 0);
    const low = weightedQuantile(observations, 0.25);
    const high = weightedQuantile(observations, 0.75);
    const median = weightedQuantile(observations, 0.5);

    // A band measured from few songs is uncertain, so it is widened by that
    // uncertainty rather than trusted as tight.
    const uncertainty = 0.25 / Math.sqrt(Math.max(1, weight));
    const halfWidth = Math.max(config.minHalfWidth, (high - low) / 2, uncertainty);

    bands[id] = {
      median,
      low,
      high,
      halfWidth,
      weight,
      members: memberCount,
      stated: statedValue,
      importance: 0,
    };

    // Tight relative to the library is what matters: an axis every song in
    // the library agrees on cannot set this playlist apart however tight it is.
    const yardstick = library[id] ?? 0.4;
    const tightness = Math.min(3, Math.max(0.3, (yardstick + 0.05) / (halfWidth * 2 + 0.05)));
    const meanConfidence = weight / Math.max(1, observations.length);
    rawImportance[id] = tightness * meanConfidence;
  }

  const total = Object.values(rawImportance).reduce((sum, v) => sum + (v ?? 0), 0);
  for (const [id, value] of Object.entries(rawImportance) as [AxisId, number][]) {
    (bands[id] as AxisBand).importance = total > 0 ? value / total : 0;
  }

  return { bands, members };
}

/** 1 inside the band, falling linearly to 0 over `falloff` beyond it. */
export function bandScore(value: number, band: AxisBand, falloff: number): number {
  const excess = Math.max(0, Math.abs(value - band.median) - band.halfWidth);
  return Math.max(0, 1 - excess / falloff);
}

export interface AxisSimilarity {
  similarity: number | null;
  /** How much of the comparison rested on confident song positions, 0-1. */
  reliability: number;
  detail: AxisMatchDetail[];
}

/**
 * How well a song sits within a playlist's bands, and near its songs.
 *
 * Each axis is weighted by its importance to the playlist times how sure we
 * are of the song's position on it. The band half is then blended with the
 * mean closeness to the nearest few members on the same scales, so a song
 * that fits one cluster of a two-sided playlist still scores.
 */
export function axisSimilarity(
  song: AxisReadings,
  profile: PlaylistAxisProfile | null,
  config = MATCHING_CONFIG.axes,
): AxisSimilarity {
  if (!profile) return { similarity: null, reliability: 0, detail: [] };

  const detail: AxisMatchDetail[] = [];
  let weighted = 0;
  let totalWeight = 0;
  let importanceCovered = 0;

  for (const [id, band] of Object.entries(profile.bands) as [AxisId, AxisBand][]) {
    const reading = song[id];
    if (reading.confidence <= 0) continue;
    const score = bandScore(reading.value, band, config.falloff);
    const weight = band.importance * reading.confidence;
    weighted += score * weight;
    totalWeight += weight;
    importanceCovered += band.importance * reading.confidence;
    detail.push({
      axis: id,
      song: reading.value,
      songSource: reading.primary,
      songConfidence: reading.confidence,
      median: band.median,
      low: band.median - band.halfWidth,
      high: band.median + band.halfWidth,
      importance: band.importance,
      score,
    });
  }

  if (totalWeight === 0) return { similarity: null, reliability: 0, detail };
  const fromBands = weighted / totalWeight;

  // Nearest members, measured on the same weighted scales.
  const importance = (id: AxisId) => profile.bands[id]?.importance ?? 0;
  const closeness = profile.members
    .map((member) => {
      let sum = 0;
      let weight = 0;
      for (const { id } of AXES) {
        const w = importance(id) * Math.min(song[id].confidence, member[id].confidence);
        if (w <= 0) continue;
        sum += w * Math.abs(song[id].value - member[id].value);
        weight += w;
      }
      return weight > 0 ? Math.max(0, 1 - (sum / weight) * 2) : null;
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)
    .slice(0, config.topK);

  const similarity = closeness.length
    ? fromBands * config.profileWeight +
      (closeness.reduce((sum, v) => sum + v, 0) / closeness.length) * config.nearestWeight
    : fromBands;

  return {
    similarity,
    reliability: Math.min(1, importanceCovered),
    detail: detail.sort((a, b) => b.importance - a.importance),
  };
}
