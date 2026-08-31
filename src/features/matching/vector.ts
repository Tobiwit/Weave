/**
 * Pure vector maths. Everything here operates on the original
 * high-dimensional embedding space, never on projected display coordinates.
 */

export type Vector = readonly number[];

export function dot(a: Vector, b: Vector): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

export function magnitude(a: Vector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

/** Cosine similarity in [-1, 1]. Returns 0 when either vector has no length. */
export function cosineSimilarity(a: Vector, b: Vector): number {
  if (!a.length || !b.length) return 0;
  const denom = magnitude(a) * magnitude(b);
  if (denom === 0) return 0;
  const value = dot(a, b) / denom;
  // Guard against floating point drift pushing us just outside [-1, 1].
  return Math.min(1, Math.max(-1, value));
}

export function normalizeVector(a: Vector): number[] {
  const m = magnitude(a);
  if (m === 0) return [...a];
  return a.map((v) => v / m);
}

/** Arithmetic mean of equal-length vectors. Empty input yields an empty vector. */
export function centroid(vectors: Vector[]): number[] {
  const usable = vectors.filter((v) => v.length > 0);
  if (usable.length === 0) return [];
  const dims = usable[0].length;
  const out = new Array<number>(dims).fill(0);
  for (const vec of usable) {
    for (let i = 0; i < dims; i += 1) out[i] += vec[i] ?? 0;
  }
  for (let i = 0; i < dims; i += 1) out[i] /= usable.length;
  return out;
}

/** Weighted blend of vectors; weights are renormalised, so they need not sum to 1. */
export function weightedBlend(
  entries: { vector: Vector; weight: number }[],
): number[] {
  const usable = entries.filter((e) => e.vector.length > 0 && e.weight > 0);
  if (usable.length === 0) return [];
  const totalWeight = usable.reduce((sum, e) => sum + e.weight, 0);
  const dims = usable[0].vector.length;
  const out = new Array<number>(dims).fill(0);
  for (const { vector, weight } of usable) {
    const w = weight / totalWeight;
    for (let i = 0; i < dims; i += 1) out[i] += (vector[i] ?? 0) * w;
  }
  return out;
}

/**
 * Centroid of every vector except the one at `excludeIndex`.
 *
 * Used by the future Playlist Audit so a song is never compared against a
 * centroid it helped define, which would inflate its own score.
 */
export function calculateLeaveOneOutCentroid(
  vectors: Vector[],
  excludeIndex: number,
): number[] {
  const remaining = vectors.filter((_, i) => i !== excludeIndex);
  return centroid(remaining);
}
