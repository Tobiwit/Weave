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

  /**
   * Matching is split into independent components so that no single facet can
   * carry the whole score. See `features/matching/components.ts`.
   */
  components: {
    /**
     * Starting weights, meant to be tuned. They express an opinion: what a
     * playlist already contains is the strongest evidence of what belongs in
     * it, style is the next most reliable, and subject matter is the least,
     * because two songs about freedom can sound nothing alike.
     *
     * They do not have to sum to 1. Components that cannot be compared are
     * dropped and the rest are renormalised.
     */
    weights: {
      playlistSongs: 0.4,
      style: 0.25,
      moodVibe: 0.2,
      tags: 0.1,
      themes: 0.05,
    },

    /** How the playlist-songs component splits between its two questions. */
    playlistSongs: {
      /** "Does this fit the playlist as a whole?" */
      centroidWeight: 0.6,
      /** "Does this song have close company here?" */
      nearestWeight: 0.4,
      /** How many nearest songs the second question averages over. */
      topK: 3,
    },

    /**
     * Each component gets its own band, because each compares a different
     * shape of text and none of them uses anything like the full similarity
     * range. One shared band would make some components nearly constant and
     * others hypersensitive.
     *
     * Measured, not chosen. Every song-playlist pair in the development
     * library was scored and the 5th and 95th percentiles of each component
     * taken as its floor and ceiling, which is what makes the middle of the
     * range spread out instead of bunching near the top. For reference, the
     * observed spans were:
     *
     *   playlistSongs  0.706 - 0.819  (median 0.759)
     *   style          0.563 - 0.713  (median 0.632)
     *   moodVibe       0.718 - 0.839  (median 0.756)
     *   themes         0.580 - 0.825  (median 0.699)
     *   tags           0.000 - 0.259  (median 0.063)
     *
     * Tags sit far lower than the rest because most pairs of songs genuinely
     * share very little rare vocabulary, so that component gets a sub-linear
     * curve rather than a wider band.
     *
     * The library these came from is small. Remeasure on a real one, and after
     * any change to a text recipe, with `weaveEvaluate` in the console.
     */
    calibration: {
      playlistSongs: { floor: 0.7, ceiling: 0.82, curve: 1 },
      style: { floor: 0.56, ceiling: 0.72, curve: 1 },
      moodVibe: { floor: 0.71, ceiling: 0.84, curve: 1 },
      tags: { floor: 0, ceiling: 0.35, curve: 0.75 },
      themes: { floor: 0.58, ceiling: 0.83, curve: 1.1 },
    },
  },

  /**
   * Bounds on community tag rarity weighting. Without a ceiling a single
   * typo'd tag would outweigh every real signal in the comparison.
   */
  tagRarity: {
    /**
     * Low enough to say "this word is worth nothing here". A word on every
     * playlist genuinely carries no information about which one something
     * belongs to, and a floor that cannot express that is what made common
     * words outrank distinctive ones.
     */
    minWeight: 0.05,
    maxWeight: 3,
    /** Below this many read songs, rarity cannot be told from coincidence. */
    minCorpusSize: 12,
    /**
     * Playlists needed before rarity is measured across playlists rather than
     * across songs. Matching picks between playlists, so that is the unit that
     * matters, but with two or three of them every word looks distinctive.
     */
    minPlaylists: 4,
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
