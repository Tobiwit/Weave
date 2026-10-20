import { describe, expect, it } from 'vitest';
import { strandHeight, strandPath, summitPoint, warp } from './weaveCurve';

const GEOMETRY = { x0: 0, x1: 100, baseline: 100, span: 80 };

/** Samples the arch densely and reports where it actually peaked. */
function measuredPeak(peak: number): number {
  let best = 0;
  let bestAt = 0;
  for (let i = 0; i <= 2000; i += 1) {
    const t = i / 2000;
    const height = strandHeight(t, peak);
    if (height > best) {
      best = height;
      bestAt = t;
    }
  }
  return bestAt;
}

describe('warp', () => {
  it('sends the requested peak to the half-way phase', () => {
    for (const peak of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(warp(peak, peak)).toBeCloseTo(0.5, 10);
    }
  });

  it('keeps both ends at the ends of the phase', () => {
    expect(warp(0, 0.3)).toBe(0);
    expect(warp(1, 0.3)).toBeCloseTo(1, 10);
  });

  it('is monotonic, so the arch never doubles back', () => {
    let previous = -1;
    for (let i = 0; i <= 500; i += 1) {
      const value = warp(i / 500, 0.2);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('strandHeight', () => {
  it('peaks at the value, which is the whole reading of the chart', () => {
    for (const peak of [0.05, 0.2, 0.5, 0.8, 0.95]) {
      expect(measuredPeak(peak)).toBeCloseTo(peak, 2);
    }
  });

  it('reaches full height exactly once', () => {
    expect(strandHeight(0.35, 0.35)).toBeCloseTo(1, 10);
  });

  it('rests on the baseline at both feet', () => {
    expect(strandHeight(0, 0.35)).toBeCloseTo(0, 10);
    expect(strandHeight(1, 0.35)).toBeCloseTo(0, 10);
  });

  it('leaves the baseline flat and is steepest half way up', () => {
    const slope = (t: number) =>
      (strandHeight(t + 0.0005, 0.5) - strandHeight(t - 0.0005, 0.5)) / 0.001;

    // A half sine would be at its steepest here, which is the tent shape this
    // curve exists to avoid.
    expect(Math.abs(slope(0.002))).toBeLessThan(0.1);
    expect(Math.abs(slope(0.5))).toBeLessThan(0.1);
    expect(slope(0.25)).toBeGreaterThan(slope(0.05));
    expect(slope(0.25)).toBeGreaterThan(slope(0.45));
  });

  it('stretches the long side of an off-centre summit into an S', () => {
    // Half way along the long side sits at half height: the inflection, not a
    // point already most of the way back down.
    expect(strandHeight(0.6, 0.2)).toBeCloseTo(0.5, 6);
    expect(strandHeight(0.4, 0.8)).toBeCloseTo(0.5, 6);
  });

  it('stays inside the plot for peaks pinned to either edge', () => {
    for (const peak of [0, 1]) {
      for (let i = 0; i <= 100; i += 1) {
        const height = strandHeight(i / 100, peak);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('strandPath', () => {
  it('starts and ends on the baseline at the plot edges', () => {
    const path = strandPath(0.6, 1, GEOMETRY);
    expect(path.startsWith('M0 100')).toBe(true);
    expect(path.endsWith('L100 100')).toBe(true);
  });

  it('scales height by amplitude, so lifts stay nested', () => {
    const tall = strandPath(0.5, 1, GEOMETRY);
    const short = strandPath(0.5, 0.5, GEOMETRY);
    expect(tall).toContain('50 20');
    expect(short).toContain('50 60');
  });
});

describe('summitPoint', () => {
  it('places the summit at the value along the plot', () => {
    expect(summitPoint(0.25, 1, GEOMETRY)).toEqual({ x: 25, y: 20 });
  });
});
