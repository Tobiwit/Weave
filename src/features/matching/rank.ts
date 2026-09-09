import type { PlaylistMatch } from '../../types';
import {
  scoreComponents,
  type PlaylistFacets,
  type SongFacets,
} from './components';
import { explainMatch, type TermVectorResolver } from './explain';
import { normalizeSimilarity } from './score';
import { cosineSimilarity, type Vector } from './vector';

export interface PlaylistCandidate {
  playlistId: string;
  /**
   * The blended playlist vector. Kept for playlist-to-playlist comparisons,
   * which are one question and do not need the facet split.
   */
  vector: Vector;
  /** The facets a song is scored against. Absent for relation-only candidates. */
  facets?: PlaylistFacets;
  /** Descriptors that define the playlist world, used only for explanations. */
  terms: string[];
}

/**
 * Scores one song against one playlist.
 *
 * The score is a weighted combination of independently calibrated components,
 * not one cosine. `similarity` carries that combination so ranking still sorts
 * on a single number, and `components` carries the working, which is what
 * makes a surprising result diagnosable.
 */
export function calculateSongPlaylistMatch(
  song: SongFacets,
  songTerms: string[],
  candidate: PlaylistCandidate,
  resolve?: TermVectorResolver,
): PlaylistMatch {
  const facets: PlaylistFacets = candidate.facets ?? {
    whole: candidate.vector,
    songVectors: [],
    style: [],
    moodVibe: [],
    themes: [],
    tags: new Map(),
  };

  const breakdown = scoreComponents(song, facets);
  const { reasons, differences } = explainMatch(
    songTerms,
    candidate.terms,
    resolve,
  );

  return {
    playlistId: candidate.playlistId,
    similarity: breakdown.combined,
    score: breakdown.score,
    components: breakdown.components,
    reasons,
    differences,
  };
}

/** Ranked strongest first. Ties fall back to playlist id for stable ordering. */
export function rankPlaylists(
  song: SongFacets,
  songTerms: string[],
  candidates: PlaylistCandidate[],
  resolve?: TermVectorResolver,
): PlaylistMatch[] {
  return candidates
    .map((candidate) =>
      calculateSongPlaylistMatch(song, songTerms, candidate, resolve),
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
