export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  year?: number;
  mbid?: string;
  isrc?: string;
  /** Where the identity came from, e.g. 'mock' | 'lastfm' | 'musicbrainz'. */
  source?: string;
}

export type AnalysisSourceKind =
  | 'metadata'
  | 'community'
  | 'lyrics'
  | 'audio'
  | 'interpretation'
  | 'manual';

export interface AnalysisSource {
  kind: AnalysisSourceKind;
  provider: string;
  ok: boolean;
  /** Human-readable note shown when a signal was unavailable. */
  note?: string;
  at: number;
}

/** A continuous characteristic, plus whether it was measured or inferred. */
export interface Characteristic {
  value: number;
  measured: boolean;
}

export interface SongProfile {
  songId: string;

  genres: string[];
  communityTags: string[];
  themes: string[];
  vibes: string[];

  mood?: string;

  energy?: number;
  intensity?: number;
  brightness?: number;
  danceability?: number;
  acousticness?: number;

  /** Only ever set when a provider genuinely measured it. */
  bpm?: number;
  /** Names of the numeric fields above that are measured rather than inferred. */
  measuredFields: string[];

  semanticEmbedding?: number[];
  /**
   * Recipe version `semanticEmbedding` was built with. Absent means it predates
   * versioning and cannot be trusted to be comparable, so it is rebuilt.
   */
  embeddingVersion?: number;

  manualTags: string[];
  removedTags: string[];

  sources: AnalysisSource[];

  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  keywords: string[];

  songIds: string[];

  keywordEmbedding?: number[];
  centroidEmbedding?: number[];
  /** Recipe version the stored vectors were built with. */
  vectorVersion?: number;

  createdAt: number;
  updatedAt: number;
  /**
   * Tombstone. A deletion has to be a fact that can travel, otherwise syncing
   * a device that never saw the delete would silently resurrect the playlist.
   */
  deletedAt?: number;
}

export interface PlaylistMatch {
  playlistId: string;
  /** The weighted combination of the components, in [0, 1]. Ranking sorts on it. */
  similarity: number;
  /** Normalised 0-100 display value. A Match Score, never a probability. */
  score: number;
  /** Per-component working, so an unexpected score can be explained. */
  components?: MatchComponent[];
  reasons: string[];
  differences: string[];
}

/** One independently calibrated part of a match score. */
export interface MatchComponent {
  name: string;
  /** Raw similarity, or null when the facet could not be compared. */
  similarity: number | null;
  score: number | null;
  /** Share of the final score this component carried, after renormalisation. */
  weight: number;
}

export interface Descriptor {
  id: string;
  label: string;
  group: DescriptorGroup;
  /** Richer hidden text used only for embedding comparison. */
  description: string;
}

export type DescriptorGroup = 'mood' | 'theme' | 'texture' | 'energy' | 'vibe';

export interface AnalysisCacheEntry {
  key: string;
  value: unknown;
  createdAt: number;
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

/** High-level visual parameters driving the mood-responsive background. */
export interface MoodVisualState {
  hueA: number;
  hueB: number;
  warmth: number;
  density: number;
  softness: number;
  curvature: number;
  motion: number;
  contrast: number;
  turbulence: number;
}
