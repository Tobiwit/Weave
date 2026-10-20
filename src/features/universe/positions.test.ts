import { describe, expect, it } from 'vitest';
import type { AxisId } from '../song/axes';
import { emptyAxisReadings, type AxisReadings } from '../song/axisReading';
import { placeLabels, positionOf } from './positions';

function reading(values: Partial<Record<AxisId, number>>): AxisReadings {
  const out = emptyAxisReadings();
  for (const [axis, value] of Object.entries(values) as [AxisId, number][]) {
    out[axis] = { value, confidence: 0.8, origin: 'measured', primary: 'test', evidence: [] };
  }
  return out;
}

describe('positionOf', () => {
  it('places a playlist at the middle of its songs', () => {
    const position = positionOf([reading({ mood: 0.7 }), reading({ mood: 0.8 }), reading({ mood: 0.9 })]);
    expect(position.mood?.median).toBe(0.8);
    expect(position.mood?.songs).toBe(3);
  });

  it('places a playlist from a single song', () => {
    expect(positionOf([reading({ energy: 0.3 })]).energy?.median).toBe(0.3);
  });

  it('lets the keywords place a playlist with no read songs', () => {
    const position = positionOf([], { mood: 0.9 });
    expect(position.mood?.median).toBe(0.9);
    expect(position.mood?.songs).toBe(0);
  });

  it('leaves out a scale nothing speaks to', () => {
    expect(positionOf([reading({ mood: 0.5 })]).sound).toBeUndefined();
  });
});

describe('placeLabels', () => {
  it('moves a label that would cover a neighbouring point or label', () => {
    const placements = placeLabels([
      { id: 'a', x: 0.4, y: 0.6, name: 'aux on' },
      { id: 'b', x: 0.5, y: 0.6, name: 'quirky' },
    ]);
    const a = placements.a;
    const b = placements.b;
    // They cannot both sit on the right at the same height.
    expect(a.flip !== b.flip || a.dy !== b.dy).toBe(true);
  });

  it('keeps a lone label to the right of its point', () => {
    expect(placeLabels([{ id: 'a', x: 0.2, y: 0.5, name: 'moonflower' }]).a).toEqual({ flip: false, dy: 0 });
  });
});
