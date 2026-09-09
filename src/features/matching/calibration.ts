import { MATCHING_CONFIG } from '../../config/matching';
import type { ComponentName } from './components';
import type { SimilarityCalibration } from './score';

/**
 * Where each component's 0-100 scale comes from.
 *
 * A calibration band maps the range a similarity actually occupies onto a
 * score. Get the ceiling wrong and everything above it clips to 100, so the
 * score stops telling a close fit from a perfect one. The defaults in
 * `MATCHING_CONFIG` were measured on a small development library and they
 * saturate on a larger one, which is not a defect in the defaults so much as
 * proof that this cannot be a constant.
 *
 * So the library measures its own. Bands live here at runtime, are persisted
 * as a setting, and fall back to the shipped defaults until a measurement has
 * been taken.
 */

export type CalibrationSet = Record<ComponentName, SimilarityCalibration>;

export interface MeasuredCalibration {
  bands: CalibrationSet;
  /** Song-playlist pairs the measurement was taken over. */
  samples: number;
  measuredAt: number;
}

export const CALIBRATION_KEY = 'matching.calibration';

let measured: MeasuredCalibration | null = null;

export function setMeasuredCalibration(value: MeasuredCalibration | null): void {
  measured = value;
}

export function getMeasuredCalibration(): MeasuredCalibration | null {
  return measured;
}

/** The band in force for a component: the library's own, else the default. */
export function calibrationFor(name: ComponentName): SimilarityCalibration {
  return measured?.bands[name] ?? MATCHING_CONFIG.components.calibration[name];
}

/** The value at a percentile of a sorted-in-place copy. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round(p * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

/**
 * Turns observed similarities into a band.
 *
 * The floor and ceiling are the 5th and 95th percentiles, so the bulk of the
 * range spreads across the scale and only genuine outliers clip. The curve is
 * then chosen to put the median at 50, which is what stops a component whose
 * values bunch near its ceiling from reading as though everything matches.
 */
export function bandFromSamples(
  values: number[],
  fallback: SimilarityCalibration,
): SimilarityCalibration {
  // Too few points and the percentiles are noise dressed up as measurement.
  if (values.length < 20) return fallback;

  const floor = percentile(values, 0.05);
  const ceiling = percentile(values, 0.95);
  if (!(ceiling > floor)) return fallback;

  const median = percentile(values, 0.5);
  const linear = (median - floor) / (ceiling - floor);

  // curve solves linear^curve = 0.5, clamped so one odd distribution cannot
  // produce a scale that is all cliff or all plateau.
  const curve =
    linear > 0.01 && linear < 0.99
      ? Math.min(2.5, Math.max(0.4, Math.log(0.5) / Math.log(linear)))
      : 1;

  return {
    floor: Math.round(floor * 1000) / 1000,
    ceiling: Math.round(ceiling * 1000) / 1000,
    curve: Math.round(curve * 100) / 100,
  };
}

export function bandsFromSamples(
  samples: Record<ComponentName, number[]>,
): CalibrationSet {
  const defaults = MATCHING_CONFIG.components.calibration;
  return {
    playlistSongs: bandFromSamples(samples.playlistSongs, defaults.playlistSongs),
    style: bandFromSamples(samples.style, defaults.style),
    moodVibe: bandFromSamples(samples.moodVibe, defaults.moodVibe),
    tags: bandFromSamples(samples.tags, defaults.tags),
    themes: bandFromSamples(samples.themes, defaults.themes),
  };
}
