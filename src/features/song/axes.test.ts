import { describe, expect, it } from 'vitest';
import {
  AXES,
  AXIS_GROUPS,
  axisValue,
  axisWord,
  isPlaced,
  placedCount,
} from './axes';

describe('AXES', () => {
  it('holds eight scales with unique ids', () => {
    expect(AXES).toHaveLength(8);
    expect(new Set(AXES.map((axis) => axis.id)).size).toBe(8);
  });

  it('splits into four groups of two, losing nobody', () => {
    expect(AXIS_GROUPS).toHaveLength(4);
    for (const group of AXIS_GROUPS) {
      expect(group.axes).toHaveLength(2);
    }
    expect(AXIS_GROUPS.flatMap((group) => group.axes)).toHaveLength(AXES.length);
  });

  it('gives every strand its own height and colour', () => {
    expect(new Set(AXES.map((axis) => axis.lift)).size).toBe(8);
    expect(new Set(AXES.map((axis) => axis.color)).size).toBe(8);
  });
});

describe('axisWord', () => {
  const energy = AXES[0];

  it('says nothing for an axis nobody has placed', () => {
    expect(axisWord(energy, undefined)).toBeUndefined();
  });

  it('names the nearer pole', () => {
    expect(axisWord(energy, 0.1)).toBe('Calm');
    expect(axisWord(energy, 0.9)).toBe('Energetic');
  });

  it('refuses to pick a side in the middle', () => {
    expect(axisWord(energy, 0.5)).toBe('Steady');
  });
});

describe('axisValue', () => {
  it('draws an unplaced axis at the centre', () => {
    expect(axisValue({}, 'energy')).toBe(0.5);
  });

  it('clamps a stored value that has drifted out of range', () => {
    expect(axisValue({ energy: 1.4 }, 'energy')).toBe(1);
    expect(axisValue({ energy: -2 }, 'energy')).toBe(0);
  });
});

describe('placedCount', () => {
  it('distinguishes placed-at-centre from never placed', () => {
    expect(isPlaced({ energy: 0.5 }, 'energy')).toBe(true);
    expect(isPlaced({}, 'energy')).toBe(false);
    expect(placedCount({})).toBe(0);
    expect(placedCount({ energy: 0.5, mood: 0.2 })).toBe(2);
  });
});
