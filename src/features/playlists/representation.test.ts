import { describe, expect, it } from 'vitest';
import { centroid } from '../matching';
import { measureCohesion } from './representation';

/**
 * Cohesion is the one number this page computes that nothing else does, so it
 * is the one worth pinning down.
 */
describe('measureCohesion', () => {
  it('reads a single tight group as having one centre', () => {
    const vectors = [
      [1, 0.02, 0],
      [1, -0.01, 0],
      [0.99, 0.03, 0],
      [1, 0, 0.02],
    ];
    const result = measureCohesion(vectors, centroid(vectors));
    expect(result?.label).toBe('One centre');
  });

  it('detects a playlist holding two distinct sounds', () => {
    // Two groups at right angles. Their centroid falls between them, so every
    // song is far from the middle but close to its own neighbours.
    const vectors = [
      [1, 0, 0],
      [0.99, 0.1, 0],
      [0, 1, 0],
      [0.1, 0.99, 0],
    ];
    const result = measureCohesion(vectors, centroid(vectors));
    expect(result?.label).toBe('Several clusters');
    expect(result!.spread).toBeGreaterThan(0.1);
  });

  it('rates a split playlist as less cohesive than a tight one', () => {
    const tight = [
      [1, 0.02, 0],
      [1, -0.02, 0],
      [0.99, 0, 0],
    ];
    const split = [
      [1, 0, 0],
      [0, 1, 0],
      [0.05, 0.99, 0],
    ];
    const a = measureCohesion(tight, centroid(tight))!;
    const b = measureCohesion(split, centroid(split))!;
    expect(b.spread).toBeGreaterThan(a.spread);
  });

  it('is not fooled into reading a lone outlier as cohesion', () => {
    // A tight pair plus one distant song. The centroid is dragged toward the
    // pair, leaving the outlier closer to the middle than to its only
    // neighbour. Unclamped, that alone would report the playlist as tight.
    const vectors = [
      [0, 1, 0],
      [0.05, 0.99, 0],
      [1, 0, 0],
    ];
    const result = measureCohesion(vectors, centroid(vectors))!;
    expect(result.spread).toBeGreaterThan(0);
    expect(result.label).not.toBe('One centre');
  });

  it('declines to judge when there is too little to go on', () => {
    expect(measureCohesion([[1, 0]], [1, 0])).toBeNull();
    expect(measureCohesion([[1, 0], [0, 1]], [1, 1])).toBeNull();
  });

  it('needs a centroid to compare against', () => {
    expect(measureCohesion([[1, 0], [0, 1], [1, 1]], undefined)).toBeNull();
    expect(measureCohesion([[1, 0], [0, 1], [1, 1]], [])).toBeNull();
  });

  it('ignores songs with no vector rather than counting them as distant', () => {
    const vectors = [
      [1, 0.02, 0],
      [1, -0.01, 0],
      [0.99, 0.03, 0],
      [],
    ];
    const result = measureCohesion(vectors, centroid(vectors));
    expect(result?.label).toBe('One centre');
  });
});
