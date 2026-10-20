/**
 * The Weave: eight bipolar scales a song is placed on by hand.
 *
 * The values stored on a profile are only ever hand-placed: the analysis
 * pipeline never writes them. The machine keeps its own reading of the same
 * scales, recomputed from measured audio and descriptors in `axisReading.ts`,
 * and the matcher uses a hand placement where there is one and that reading
 * where there is not. An axis that has never been touched stays absent here
 * rather than defaulting to a number, because "we have not decided" and "dead
 * centre" are different facts and only one of them should be coloured in.
 */

export type AxisId =
  | 'energy'
  | 'weight'
  | 'mood'
  | 'emotion'
  | 'presence'
  | 'finish'
  | 'movement'
  | 'sound';

export type AxisGroupId = 'energy' | 'emotion' | 'presence' | 'character';

export interface Axis {
  id: AxisId;
  /** The name of the axis itself, e.g. "Weight". */
  label: string;
  group: AxisGroupId;
  /** The word at 0. */
  low: string;
  /** The word at 1. */
  high: string;
  /**
   * The word for the middle of this scale. "Even" said nothing: what sits
   * between calm and energetic is steady, between organic and electric it is
   * hybrid, and the word should say which.
   */
  mid: string;
  /** The strand's colour, shared by the chart, the list and the raster. */
  color: string;
  /**
   * How tall this strand rides in the weave, 0-1. Carries no meaning: it only
   * keeps eight overlapping curves telling themselves apart.
   */
  lift: number;
}

export interface AxisGroup {
  id: AxisGroupId;
  label: string;
  axes: Axis[];
}

/** The value an axis reads as when it has never been placed. */
export const AXIS_CENTRE = 0.5;

/**
 * The canonical order, which is also the drawing order of the weave.
 *
 * Lifts descend across the list so the strands nest rather than collide; the
 * pairs are split across groups on meaning, not on adjacency, which is why the
 * numbering and the grouping deliberately disagree.
 */
export const AXES: Axis[] = [
  {
    id: 'energy',
    label: 'Energy',
    group: 'energy',
    low: 'Calm',
    high: 'Energetic',
    mid: 'Steady',
    color: 'oklch(0.79 0.155 68)',
    lift: 1,
  },
  {
    id: 'weight',
    label: 'Weight',
    group: 'presence',
    low: 'Light',
    high: 'Heavy',
    mid: 'Grounded',
    color: 'oklch(0.77 0.115 215)',
    lift: 0.915,
  },
  {
    id: 'mood',
    label: 'Mood',
    group: 'emotion',
    low: 'Bright',
    high: 'Dark',
    mid: 'Dusky',
    color: 'oklch(0.73 0.16 350)',
    lift: 0.83,
  },
  {
    id: 'emotion',
    label: 'Emotion',
    group: 'emotion',
    low: 'Controlled',
    high: 'Vulnerable',
    mid: 'Open',
    color: 'oklch(0.7 0.155 305)',
    lift: 0.745,
  },
  {
    id: 'presence',
    label: 'Presence',
    group: 'presence',
    low: 'Quiet',
    high: 'Loud',
    mid: 'Full',
    color: 'oklch(0.72 0.14 252)',
    lift: 0.66,
  },
  {
    id: 'finish',
    label: 'Finish',
    group: 'character',
    low: 'Raw',
    high: 'Elegant',
    mid: 'Natural',
    color: 'oklch(0.82 0.13 165)',
    lift: 0.575,
  },
  {
    id: 'movement',
    label: 'Movement',
    group: 'energy',
    low: 'Still',
    high: 'Danceable',
    mid: 'Swaying',
    color: 'oklch(0.75 0.17 38)',
    lift: 0.49,
  },
  {
    id: 'sound',
    label: 'Sound',
    group: 'character',
    low: 'Organic',
    high: 'Electric',
    mid: 'Hybrid',
    color: 'oklch(0.85 0.16 128)',
    lift: 0.405,
  },
];

export const AXES_BY_ID: Record<AxisId, Axis> = Object.fromEntries(
  AXES.map((axis) => [axis.id, axis]),
) as Record<AxisId, Axis>;

const GROUP_LABELS: Record<AxisGroupId, string> = {
  energy: 'Energy',
  emotion: 'Emotion',
  presence: 'Presence',
  character: 'Character',
};

/** Groups in reading order, each holding the axes that belong to it. */
export const AXIS_GROUPS: AxisGroup[] = (
  ['energy', 'emotion', 'presence', 'character'] as AxisGroupId[]
).map((id) => ({
  id,
  label: GROUP_LABELS[id],
  axes: AXES.filter((axis) => axis.group === id),
}));

/** What is stored on a profile. Absent keys are axes nobody has placed yet. */
export type AxisValues = Partial<Record<AxisId, number>>;

/** The band around the middle that reads as neither pole. */
const EVEN_BAND = 0.06;

/**
 * The one word a placed axis is worth.
 *
 * Degree is left to the raster and the curve; spelling it out in words here
 * would mean inventing five adjectives per axis and pretending a hand-placed
 * dot is that precise.
 */
export function axisWord(axis: Axis, value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Math.abs(value - AXIS_CENTRE) <= EVEN_BAND) return axis.mid;
  return value < AXIS_CENTRE ? axis.low : axis.high;
}

/** The value to draw at, which is the centre for anything unplaced. */
export function axisValue(values: AxisValues, id: AxisId): number {
  const value = values[id];
  return value === undefined ? AXIS_CENTRE : clamp01(value);
}

export function isPlaced(values: AxisValues, id: AxisId): boolean {
  return values[id] !== undefined;
}

/** How many of the eight have been placed. The screen's only standing number. */
export function placedCount(values: AxisValues): number {
  return AXES.filter((axis) => isPlaced(values, axis.id)).length;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return AXIS_CENTRE;
  return Math.min(1, Math.max(0, value));
}
