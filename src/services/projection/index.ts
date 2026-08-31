/**
 * Dimensionality reduction for the Universe view.
 *
 * The output is for display only. Similarity is always computed in the
 * original high-dimensional space; these coordinates never feed matching.
 */
export interface ProjectionProvider {
  readonly id: string;
  project(vectors: number[][]): Promise<[number, number][]>;
}

/** Deterministic fallback for tiny inputs, where UMAP has nothing to learn. */
function circleLayout(count: number): [number, number][] {
  if (count === 1) return [[0, 0]];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)] as [number, number];
  });
}

/** Scales any projection into a stable [-1, 1] box so the view can frame it. */
function fitToUnitBox(points: [number, number][]): [number, number][] {
  if (points.length === 0) return [];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const span = Math.max(spanX, spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [((x - cx) / span) * 2, ((y - cy) / span) * 2]);
}

export const umapProjectionProvider: ProjectionProvider = {
  id: 'umap',
  async project(vectors) {
    if (vectors.length === 0) return [];
    if (vectors.length < 4) return fitToUnitBox(circleLayout(vectors.length));

    const { UMAP } = await import('umap-js');
    const umap = new UMAP({
      nComponents: 2,
      // With a handful of playlists, the default neighbour count exceeds the
      // dataset and UMAP throws; keep it inside the sample size.
      nNeighbors: Math.max(2, Math.min(15, vectors.length - 1)),
      minDist: 0.15,
      spread: 1.2,
      random: seededRandom(42),
    });

    const result = umap.fit(vectors) as number[][];
    return fitToUnitBox(result.map(([x, y]) => [x, y] as [number, number]));
  },
};

/** Fixed seed so the universe does not rearrange itself on every visit. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export async function projectVectors(
  vectors: number[][],
  provider: ProjectionProvider = umapProjectionProvider,
): Promise<[number, number][]> {
  try {
    return await provider.project(vectors);
  } catch {
    // A failed projection must never take the page down; fall back to a ring.
    return fitToUnitBox(circleLayout(vectors.length));
  }
}
