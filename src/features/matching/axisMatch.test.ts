import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import type { AxisId } from '../song/axes';
import { emptyAxisReadings, type AxisReadings } from '../song/axisReading';
import {
  axisSimilarity,
  bandScore,
  buildAxisProfile,
  weightedQuantile,
} from './axisMatch';

const config = MATCHING_CONFIG.axes;

/** A reading placing the given axes with full confidence and leaving the rest unknown. */
function reading(values: Partial<Record<AxisId, number>>, confidence = 0.8): AxisReadings {
  const out = emptyAxisReadings();
  for (const [axis, value] of Object.entries(values) as [AxisId, number][]) {
    out[axis] = { value, confidence, origin: 'measured', primary: 'test', evidence: [] };
  }
  return out;
}

describe('weightedQuantile', () => {
  it('finds the weighted median', () => {
    expect(
      weightedQuantile(
        [
          { value: 0.1, weight: 1 },
          { value: 0.5, weight: 1 },
          { value: 0.9, weight: 3 },
        ],
        0.5,
      ),
    ).toBe(0.9);
  });
});

describe('buildAxisProfile', () => {
  it('is not dragged by an outlier the way a mean would be', () => {
    const members = [0.8, 0.82, 0.78, 0.81, 0.05].map((mood) => reading({ mood }));
    const profile = buildAxisProfile(members, {}, {}, config);
    expect(profile.bands.mood?.median).toBeGreaterThan(0.75);
  });

  it('needs a few songs before an axis has a shape', () => {
    const profile = buildAxisProfile([reading({ mood: 0.8 })], {}, {}, config);
    expect(profile.bands.mood).toBeUndefined();
  });

  it('lets the playlist words give a young playlist a shape', () => {
    const profile = buildAxisProfile([reading({ mood: 0.8 })], { mood: 0.9 }, {}, config);
    expect(profile.bands.mood?.stated).toBe(0.9);
  });

  it('gives a tight axis more importance than a spread one', () => {
    const members = [
      reading({ mood: 0.8, energy: 0.1 }),
      reading({ mood: 0.82, energy: 0.9 }),
      reading({ mood: 0.79, energy: 0.5 }),
      reading({ mood: 0.81, energy: 0.3 }),
    ];
    const profile = buildAxisProfile(members, {}, { mood: 0.4, energy: 0.4 }, config);
    expect(profile.bands.mood?.importance ?? 0).toBeGreaterThan(
      profile.bands.energy?.importance ?? 0,
    );
  });
});

describe('bandScore', () => {
  const band = {
    median: 0.5,
    low: 0.4,
    high: 0.6,
    halfWidth: 0.1,
    weight: 4,
    members: 4,
    importance: 1,
  };

  it('scores fully inside the band and falls off beyond it', () => {
    expect(bandScore(0.55, band, 0.3)).toBe(1);
    expect(bandScore(0.75, band, 0.3)).toBeCloseTo(0.5, 5);
    expect(bandScore(1, band, 0.3)).toBe(0);
  });
});

describe('axisSimilarity', () => {
  const members = [0.8, 0.85, 0.78, 0.82].map((mood) => reading({ mood, energy: 0.3 }));
  const profile = buildAxisProfile(members, {}, {}, config);

  it('scores a song inside the playlist above one outside it', () => {
    const inside = axisSimilarity(reading({ mood: 0.8, energy: 0.3 }), profile, config);
    const outside = axisSimilarity(reading({ mood: 0.1, energy: 0.9 }), profile, config);
    expect(inside.similarity ?? 0).toBeGreaterThan(outside.similarity ?? 1);
  });

  it('reports low reliability for a song whose position is a guess', () => {
    const guess = axisSimilarity(reading({ mood: 0.8, energy: 0.3 }, 0.2), profile, config);
    const sure = axisSimilarity(reading({ mood: 0.8, energy: 0.3 }, 0.9), profile, config);
    expect(guess.reliability).toBeLessThan(sure.reliability);
  });

  it('cannot compare without a profile', () => {
    expect(axisSimilarity(reading({ mood: 0.5 }), null, config).similarity).toBeNull();
  });
});
