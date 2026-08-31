import { MATCHING_CONFIG } from '../../config/matching';
import { centroid, weightedBlend, type Vector } from './vector';

export interface PlaylistVectorInput {
  /** Embedding of the playlist name, description and keywords. */
  keywordEmbedding?: Vector;
  /** Embeddings of the songs currently in the playlist. */
  songEmbeddings?: Vector[];
}

export interface PlaylistVectorResult {
  vector: number[];
  centroidEmbedding: number[];
  /** True when example songs contributed, i.e. the blend was not keyword-only. */
  usedExamples: boolean;
}

/**
 * Combines what a playlist says about itself with what its songs actually are.
 *
 * With no example songs the stated world is all we have, so it carries the
 * full weight; otherwise the configured blend applies.
 */
export interface PlaylistVectorWeights {
  keywordWeight: number;
  centroidWeight: number;
}

export function calculatePlaylistVector(
  input: PlaylistVectorInput,
  weights: PlaylistVectorWeights = MATCHING_CONFIG,
): PlaylistVectorResult {
  const songVectors = (input.songEmbeddings ?? []).filter((v) => v.length > 0);
  const songCentroid = centroid(songVectors);
  const keyword = input.keywordEmbedding ?? [];

  if (songCentroid.length === 0) {
    return {
      vector: [...keyword],
      centroidEmbedding: [],
      usedExamples: false,
    };
  }

  if (keyword.length === 0) {
    return {
      vector: [...songCentroid],
      centroidEmbedding: songCentroid,
      usedExamples: true,
    };
  }

  return {
    vector: weightedBlend([
      { vector: keyword, weight: weights.keywordWeight },
      { vector: songCentroid, weight: weights.centroidWeight },
    ]),
    centroidEmbedding: songCentroid,
    usedExamples: true,
  };
}
