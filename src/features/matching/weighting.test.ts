import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import { learnWeighting } from './weighting';

const config = MATCHING_CONFIG.weighting;

describe('learnWeighting', () => {
  it('raises the component that separates members from the rest', () => {
    const result = learnWeighting(
      { axes: [90, 85, 88, 92], themes: [55, 50, 52, 54] },
      { axes: [30, 35, 25, 40], themes: [50, 52, 49, 51] },
      20,
      config,
    );
    expect(result?.factors.axes).toBeGreaterThan(1);
    expect(result?.factors.themes).toBeLessThan(1);
  });

  it('shrinks a small playlist towards 1', () => {
    const members = { axes: [90, 85, 88], themes: [50, 52, 51] };
    const others = { axes: [30, 35, 25], themes: [50, 52, 49] };
    const small = learnWeighting(members, others, 3, config);
    const large = learnWeighting(members, others, 60, config);
    expect(Math.abs((small?.factors.axes ?? 1) - 1)).toBeLessThan(
      Math.abs((large?.factors.axes ?? 1) - 1),
    );
  });

  it('learns nothing from a playlist indistinct on every component', () => {
    const result = learnWeighting(
      { axes: [50, 50, 50], themes: [50, 50, 50] },
      { axes: [50, 50, 50], themes: [50, 50, 50] },
      10,
      config,
    );
    expect(result?.factors.axes).toBe(1);
  });

  it('needs enough members', () => {
    expect(learnWeighting({ axes: [90] }, { axes: [10, 10, 10] }, 1, config)).toBeNull();
  });
});
