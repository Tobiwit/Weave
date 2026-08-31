import type { PlaylistMatch } from '../../types';
import { explainMatch, type TermVectorResolver } from './explain';
import { normalizeSimilarity } from './score';
import { cosineSimilarity, type Vector } from './vector';

export interface PlaylistCandidate {
  playlistId: string;
  /** High-dimensional playlist vector. Never a projected coordinate. */
  vector: Vector;
  /** Descriptors that define the playlist world, used only for explanations. */
  terms: string[];
}

export function calculateSongPlaylistMatch(
  songEmbedding: Vector,
  songTerms: string[],
  candidate: PlaylistCandidate,
  resolve?: TermVectorResolver,
): PlaylistMatch {
  const similarity = cosineSimilarity(songEmbedding, candidate.vector);
  const { reasons, differences } = explainMatch(
    songTerms,
    candidate.terms,
    resolve,
  );
  return {
    playlistId: candidate.playlistId,
    similarity,
    score: normalizeSimilarity(similarity),
    reasons,
    differences,
  };
}

/** Ranked strongest first. Ties fall back to playlist id for stable ordering. */
export function rankPlaylists(
  songEmbedding: Vector,
  songTerms: string[],
  candidates: PlaylistCandidate[],
  resolve?: TermVectorResolver,
): PlaylistMatch[] {
  return candidates
    .map((candidate) =>
      calculateSongPlaylistMatch(songEmbedding, songTerms, candidate, resolve),
    )
    .sort(
      (a, b) =>
        b.similarity - a.similarity || a.playlistId.localeCompare(b.playlistId),
    );
}

export interface PlaylistRelation {
  playlistId: string;
  similarity: number;
  score: number;
}

/** Nearest other playlists to the given one, in the original embedding space. */
export function nearestPlaylists(
  target: PlaylistCandidate,
  others: PlaylistCandidate[],
  limit = 3,
): PlaylistRelation[] {
  return others
    .filter((other) => other.playlistId !== target.playlistId)
    .map((other) => {
      const similarity = cosineSimilarity(target.vector, other.vector);
      return {
        playlistId: other.playlistId,
        similarity,
        score: normalizeSimilarity(similarity),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * How tightly a playlist holds together: the mean distance of its songs from
 * their own centroid, surfaced as "breadth" rather than a raw statistic.
 */
export function semanticBreadth(
  songVectors: Vector[],
  centroidVector: Vector,
): number {
  const usable = songVectors.filter((v) => v.length > 0);
  if (usable.length < 2 || centroidVector.length === 0) return 0;
  const mean =
    usable.reduce((sum, v) => sum + cosineSimilarity(v, centroidVector), 0) /
    usable.length;
  // 1 means every song sits on the centroid; invert so higher reads as broader.
  return Math.min(1, Math.max(0, 1 - mean));
}
