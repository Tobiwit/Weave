/**
 * The embedding model is centralised here so no other module depends on a
 * specific implementation or model id.
 */
export const EMBEDDING_CONFIG = {
  /** Small, browser-friendly sentence embedding model (384 dimensions). */
  modelId: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  /** Quantised weights keep the one-time download small (~23MB). */
  dtype: 'q8' as const,
  pooling: 'mean' as const,
  normalize: true,
  /** Fallback dimensionality used by the deterministic offline embedder. */
  fallbackDimensions: 384,
} as const;

/**
 * Bumped whenever the text a vector is built from changes shape.
 *
 * Stored vectors carry the version they were built with, so a release that
 * changes the recipe recomputes them instead of silently comparing vectors
 * from two different formulations.
 */
export const VECTOR_RECIPE_VERSION = 2;
