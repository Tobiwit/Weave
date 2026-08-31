import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import { matchBand, normalizeSimilarity } from './score';

const { floor, ceiling } = MATCHING_CONFIG.normalization;

describe('normalizeSimilarity', () => {
  it('maps the calibration band onto 0-100', () => {
    expect(normalizeSimilarity(floor)).toBe(0);
    expect(normalizeSimilarity(ceiling)).toBe(100);
  });

  it('clamps values outside the band', () => {
    expect(normalizeSimilarity(-1)).toBe(0);
    expect(normalizeSimilarity(1)).toBe(100);
  });

  it('is monotonic across the range', () => {
    let previous = -1;
    for (let s = -0.2; s <= 1; s += 0.05) {
      const score = normalizeSimilarity(s);
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('always returns a whole number in range', () => {
    for (const value of [0.1, 0.234, 0.5, 0.63, 0.71]) {
      const score = normalizeSimilarity(value);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('handles non-finite input without producing NaN', () => {
    expect(normalizeSimilarity(Number.NaN)).toBe(0);
    expect(normalizeSimilarity(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('can be recalibrated without touching callers', () => {
    const strict = { floor: 0.5, ceiling: 0.9, curve: 1 };
    expect(normalizeSimilarity(0.5, strict)).toBe(0);
    expect(normalizeSimilarity(0.7, strict)).toBe(50);
    expect(normalizeSimilarity(0.9, strict)).toBe(100);
  });

  it('guards against an inverted or empty band', () => {
    expect(normalizeSimilarity(0.5, { floor: 0.9, ceiling: 0.9, curve: 1 })).toBe(0);
  });
});

describe('matchBand', () => {
  it('bands scores for emphasis without exposing the numbers', () => {
    expect(matchBand(94)).toBe('strong');
    expect(matchBand(58)).toBe('partial');
    expect(matchBand(20)).toBe('distant');
  });
});
