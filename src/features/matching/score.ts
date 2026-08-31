import { MATCHING_CONFIG } from '../../config/matching';

export interface SimilarityCalibration {
  floor: number;
  ceiling: number;
  curve: number;
}

/**
 * Maps a raw cosine similarity onto a 0-100 Match Score.
 *
 * Deliberately isolated: this is display calibration, not a probability, and it
 * is expected to be retuned as the embedding model or descriptor set changes.
 */
export function normalizeSimilarity(
  similarity: number,
  config: SimilarityCalibration = MATCHING_CONFIG.normalization,
): number {
  const { floor, ceiling, curve } = config;
  if (!Number.isFinite(similarity)) return 0;
  const span = ceiling - floor;
  if (span <= 0) return 0;
  const clamped = Math.min(ceiling, Math.max(floor, similarity));
  const linear = (clamped - floor) / span;
  const shaped = Math.pow(linear, curve);
  return Math.round(Math.min(100, Math.max(0, shaped * 100)));
}

/** Coarse band used for copy and visual emphasis, never shown as a raw number. */
export type MatchBand = 'strong' | 'partial' | 'distant';

export function matchBand(score: number): MatchBand {
  if (score >= 72) return 'strong';
  if (score >= 45) return 'partial';
  return 'distant';
}
