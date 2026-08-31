/**
 * Tunable weights and calibration for the matching engine.
 * Kept isolated so scoring can be recalibrated without touching feature code.
 */
export const MATCHING_CONFIG = {
  /** Blend of a playlist's stated world vs. the songs actually in it. */
  keywordWeight: 0.35,
  centroidWeight: 0.65,

  /**
   * Cosine similarity between two sentence embeddings never uses the full
   * [-1, 1] range. Every text involved here describes music, so the model
   * places them all in one neighbourhood: measured over the development
   * library, real song-to-playlist pairs run from about 0.17 to 0.91, with a
   * median near 0.72. Mapping that measured band onto 0-100 is what makes the
   * displayed score discriminating rather than uniformly high.
   *
   * Recalibrate these three numbers if the embedding model or the text recipes
   * in `features/matching/terms.ts` change.
   */
  normalization: {
    floor: 0.3,
    ceiling: 0.89,
    /** <1 lifts mid-range scores, >1 pushes them down. */
    curve: 1.5,
  },

  /**
   * Comparing a song against the other songs of its own playlist is a
   * different distribution from comparing it against a playlist vector:
   * measured over the development library it runs from about 0.39 to 0.87.
   * It gets its own band so a representativeness score stays readable.
   */
  withinPlaylistNormalization: {
    floor: 0.32,
    ceiling: 0.9,
    curve: 1,
  },

  /** How many descriptors an explanation may list per column. */
  maxOverlapReasons: 5,
  maxDifferenceReasons: 3,

  /** Descriptor selection during interpretation. */
  descriptors: {
    minSimilarity: 0.18,
    /**
     * Similarities from a sentence model cluster tightly, so an absolute floor
     * alone lets weak filler through. A descriptor must also score close to the
     * best in its own group to be worth showing.
     */
    relativeFloor: 0.82,
    maxPerGroup: { mood: 1, energy: 1, theme: 3, texture: 2, vibe: 3 },
  },
} as const;
