export interface Point {
  x: number;
  y: number;
}

/** Deterministic per-connection randomness so a flow keeps its character. */
export function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function jitter(seed: number, salt: number): number {
  const s = Math.sin((seed * 1000 + salt) * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export interface FlowPathOptions {
  seed: number;
  /** 0-1, how far the path bows away from a straight line. */
  curvature: number;
  /** Advances slow deformation. */
  time: number;
  /** 0-1, extra irregularity in the control points. */
  turbulence: number;
}

/**
 * Builds an irregular two-segment cubic path between two points.
 *
 * Two segments with independently offset control points avoid the tell-tale
 * symmetry of a single arc, so the line reads as an organic thread rather than
 * a connector in a diagram.
 */
export function buildFlowPath(
  from: Point,
  to: Point,
  options: FlowPathOptions,
): string {
  const { seed, curvature, time, turbulence } = options;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;

  // Unit normal, used to push control points off the direct line.
  const nx = -dy / length;
  const ny = dx / length;

  const drift = Math.sin(time * 0.6 + seed * 7) * 0.35 + Math.cos(time * 0.37 + seed * 3) * 0.2;
  const bow = length * curvature * (0.18 + turbulence * 0.22);

  const swing = (jitter(seed, 1) * 0.6 + drift) * bow;
  const counterSwing = (jitter(seed, 2) * 0.5 - drift * 0.6) * bow;

  const mid: Point = {
    x: from.x + dx * 0.5 + nx * swing * 0.9,
    y: from.y + dy * 0.5 + ny * swing * 0.9,
  };

  const c1: Point = {
    x: from.x + dx * 0.2 + nx * swing,
    y: from.y + dy * 0.2 + ny * swing,
  };
  const c2: Point = {
    x: from.x + dx * 0.38 + nx * swing * 1.15,
    y: from.y + dy * 0.38 + ny * swing * 1.15,
  };
  const c3: Point = {
    x: from.x + dx * 0.66 + nx * counterSwing,
    y: from.y + dy * 0.66 + ny * counterSwing,
  };
  const c4: Point = {
    x: from.x + dx * 0.86 + nx * counterSwing * 0.5,
    y: from.y + dy * 0.86 + ny * counterSwing * 0.5,
  };

  return [
    `M ${round(from.x)} ${round(from.y)}`,
    `C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(mid.x)} ${round(mid.y)}`,
    `C ${round(c3.x)} ${round(c3.y)}, ${round(c4.x)} ${round(c4.y)}, ${round(to.x)} ${round(to.y)}`,
  ].join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
