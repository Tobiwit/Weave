import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import { bandFromSamples } from './calibration';

const FALLBACK = { floor: 0.3, ceiling: 0.89, curve: 1.5 };

/** Evenly spaced values across a range, as a stand-in for a real distribution. */
function spread(from: number, to: number, count: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => from + ((to - from) * i) / (count - 1),
  );
}

describe('bandFromSamples', () => {
  it('brackets the bulk of the observed range', () => {
    const band = bandFromSamples(spread(0.6, 0.9, 100), FALLBACK);
    expect(band.floor).toBeGreaterThan(0.6);
    expect(band.ceiling).toBeLessThan(0.9);
    expect(band.ceiling).toBeGreaterThan(band.floor);
  });

  it('puts the median near the middle of the scale', () => {
    const band = bandFromSamples(spread(0.5, 0.95, 200), FALLBACK);
    const median = 0.725;
    const linear = (median - band.floor) / (band.ceiling - band.floor);
    expect(Math.pow(linear, band.curve) * 100).toBeGreaterThan(40);
    expect(Math.pow(linear, band.curve) * 100).toBeLessThan(60);
  });

  it('lifts a distribution bunched near its ceiling instead of clipping it', () => {
    // Most values high, a few low: the case that saturates a fixed band.
    const values = [...spread(0.8, 0.88, 90), ...spread(0.4, 0.6, 10)];
    const band = bandFromSamples(values, FALLBACK);
    expect(band.ceiling).toBeLessThan(0.9);
    expect(band).not.toEqual(FALLBACK);
  });

  it('refuses to measure from too few points', () => {
    expect(bandFromSamples([0.1, 0.5, 0.9], FALLBACK)).toEqual(FALLBACK);
  });

  it('falls back when every sample is identical', () => {
    expect(bandFromSamples(Array(40).fill(0.7), FALLBACK)).toEqual(FALLBACK);
  });

  it('keeps the curve inside sane bounds', () => {
    const band = bandFromSamples(
      [...Array(95).fill(0.899), ...spread(0.1, 0.4, 25)],
      FALLBACK,
    );
    expect(band.curve).toBeGreaterThanOrEqual(0.4);
    expect(band.curve).toBeLessThanOrEqual(2.5);
  });

  it('produces a band the score function can use end to end', () => {
    const band = bandFromSamples(spread(0.5, 0.9, 60), FALLBACK);
    expect(band.floor).toBeLessThan(band.ceiling);
    expect(Number.isFinite(band.curve)).toBe(true);
    expect(MATCHING_CONFIG.components.calibration.style.floor).toBeLessThan(1);
  });
});
