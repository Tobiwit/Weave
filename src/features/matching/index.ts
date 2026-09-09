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
export {
  normalizeSimilarity,
  matchBand,
  type MatchBand,
  type SimilarityCalibration,
} from './score';
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
  profileFacets,
  profileEmbeddingText,
  playlistEmbeddingText,
  styleEmbeddingText,
  moodEmbeddingText,
  themeEmbeddingText,
  playlistStyleText,
  playlistMoodText,
  playlistThemeText,
  manualTagLabel,
  eraOf,
  type ProfileFacets,
} from './terms';
export {
  buildTagCorpus,
  tagWeight,
  songTagVector,
  playlistTagVector,
  tagSimilarity,
  normalizeTag,
  type TagCorpus,
  type TagVector,
} from './tagRarity';
export {
  scoreComponents,
  playlistSongSimilarity,
  COMPONENT_ORDER,
  type ComponentName,
  type ComponentResult,
  type MatchBreakdown,
  type SongFacets,
  type PlaylistFacets,
} from './components';
