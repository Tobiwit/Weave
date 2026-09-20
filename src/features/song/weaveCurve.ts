/**
 * The geometry of one strand of the weave.
 *
 * A strand is a single arch: it leaves the baseline at the left edge, rises to
 * exactly one summit, and returns to the baseline at the right edge. The summit
 * sits at the axis value, so the chart is read the way a chart is read — by
 * where the high point falls along the horizontal — and the amplitude carries
 * nothing but identity.
 *
 * The arch is a half sine in a warped parameter. Warping the input rather than
 * skewing the output keeps both feet on the baseline and keeps the summit flat,
 * so a strand peaking near an edge leans without kinking or clipping.
 */

/** Points a strand is sampled at. Enough that straight segments read as curve. */
const SAMPLES = 88;

/**
 * Maps position along the strand to phase, such that `peak` lands at the
 * half-way phase and both ends stay at zero.
 *
 * The two halves meet at the summit where the sine's slope is zero, so the
 * change of rate is invisible even when the summit is hard against an edge.
 */
export function warp(t: number, peak: number): number {
  // A summit exactly on an edge would make one half of the arch zero-width and
  // divide by nothing, so it is held just inside.
  const p = Math.min(0.999, Math.max(0.001, peak));
  return t <= p ? (0.5 * t) / p : 0.5 + (0.5 * (t - p)) / (1 - p);
}

/** Height of the strand at position `t`, in 0-1 of its own amplitude. */
export function strandHeight(t: number, peak: number): number {
  return Math.sin(Math.PI * warp(t, peak));
}

export interface StrandGeometry {
  /** Left and right edge of the plot, in viewBox units. */
  x0: number;
  x1: number;
  /** The horizontal the strand stands on. */
  baseline: number;
  /** Vertical distance from the baseline to a full-amplitude summit. */
  span: number;
}

/**
 * An open path along the top of the arch. Stroked, never filled — a filled
 * arch reads as a bar chart, and these are meant to read as threads.
 */
export function strandPath(
  peak: number,
  amplitude: number,
  geometry: StrandGeometry,
): string {
  const { x0, x1, baseline, span } = geometry;
  const width = x1 - x0;
  let path = '';

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const x = x0 + t * width;
    const y = baseline - strandHeight(t, peak) * amplitude * span;
    path += `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
    if (i < SAMPLES) path += ' ';
  }

  return path;
}

/** Where a strand's summit sits, for placing its marker and its label. */
export function summitPoint(
  peak: number,
  amplitude: number,
  geometry: StrandGeometry,
): { x: number; y: number } {
  const { x0, x1, baseline, span } = geometry;
  return {
    x: x0 + peak * (x1 - x0),
    y: baseline - amplitude * span,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
