import { describe, expect, it } from 'vitest';
import {
  calculateLeaveOneOutCentroid,
  centroid,
  cosineSimilarity,
  normalizeVector,
  weightedBlend,
} from './vector';

describe('cosineSimilarity', () => {
  it('returns 1 for identical directions regardless of magnitude', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when either vector is empty or zero length', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('stays inside [-1, 1] despite floating point drift', () => {
    const a = [0.1, 0.2, 0.30000000000000004];
    expect(cosineSimilarity(a, a)).toBeLessThanOrEqual(1);
    expect(cosineSimilarity(a, a)).toBeGreaterThanOrEqual(-1);
  });
});

describe('centroid', () => {
  it('averages component-wise', () => {
    expect(centroid([[0, 0], [2, 4], [4, 2]])).toEqual([2, 2]);
  });

  it('ignores empty vectors', () => {
    expect(centroid([[1, 1], [], [3, 3]])).toEqual([2, 2]);
  });

  it('returns an empty vector for no usable input', () => {
    expect(centroid([])).toEqual([]);
    expect(centroid([[]])).toEqual([]);
  });
});

describe('weightedBlend', () => {
  it('renormalises weights that do not sum to 1', () => {
    const result = weightedBlend([
      { vector: [0, 0], weight: 35 },
      { vector: [10, 20], weight: 65 },
    ]);
    expect(result[0]).toBeCloseTo(6.5, 10);
    expect(result[1]).toBeCloseTo(13, 10);
  });

  it('skips zero-weight and empty entries', () => {
    const result = weightedBlend([
      { vector: [4, 4], weight: 0 },
      { vector: [], weight: 1 },
      { vector: [2, 2], weight: 1 },
    ]);
    expect(result).toEqual([2, 2]);
  });

  it('returns an empty vector when nothing contributes', () => {
    expect(weightedBlend([])).toEqual([]);
  });
});

describe('normalizeVector', () => {
  it('produces unit length', () => {
    const result = normalizeVector([3, 4]);
    expect(result).toEqual([0.6, 0.8]);
  });

  it('leaves a zero vector alone', () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
  });
});

describe('calculateLeaveOneOutCentroid', () => {
  it('excludes the evaluated vector from the centroid', () => {
    const vectors = [
      [10, 0],
      [0, 2],
      [0, 4],
    ];
    expect(calculateLeaveOneOutCentroid(vectors, 0)).toEqual([0, 3]);
  });

  it('does not let a song influence what it is compared against', () => {
    const outlier = [1, 0];
    const cluster = [
      [0, 1],
      [0, 1],
      [0, 1],
    ];
    const vectors = [outlier, ...cluster];

    const naive = cosineSimilarity(outlier, centroid(vectors));
    const honest = cosineSimilarity(
      outlier,
      calculateLeaveOneOutCentroid(vectors, 0),
    );

    // Including itself inflates the outlier's own score; leaving it out does not.
    expect(honest).toBeLessThan(naive);
    expect(honest).toBeCloseTo(0, 10);
  });

  it('returns an empty vector when nothing else remains', () => {
    expect(calculateLeaveOneOutCentroid([[1, 2]], 0)).toEqual([]);
  });
});
