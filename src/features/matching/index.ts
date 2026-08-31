export {
  cosineSimilarity,
  centroid,
  normalizeVector,
  weightedBlend,
  calculateLeaveOneOutCentroid,
  dot,
  magnitude,
  type Vector,
} from './vector';
export { calculatePlaylistVector, type PlaylistVectorResult } from './playlistVector';
export { normalizeSimilarity, matchBand, type MatchBand } from './score';
export { explainMatch, type Explanation, type TermVectorResolver } from './explain';
export {
  calculateSongPlaylistMatch,
  rankPlaylists,
  nearestPlaylists,
  semanticBreadth,
  type PlaylistCandidate,
  type PlaylistRelation,
} from './rank';
export {
  activeProfileTerms,
  playlistTerms,
  dedupeTerms,
  profileEmbeddingText,
  playlistEmbeddingText,
} from './terms';
