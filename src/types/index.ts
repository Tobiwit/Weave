import type { AxisId } from '../features/song/axes';

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  year?: number;
  mbid?: string;
  isrc?: string;
  /**
   * Codes of every recording MusicBrainz holds for this same song: other
   * masterings, re-releases, compilation copies. Audio sources each know a
   * different one, so all of them are asked at once.
   */
  altIsrcs?: string[];
  altMbids?: string[];
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

/**
 * One line of the development trace: a source that was asked, or a value that
 * was worked out from others.
 *
 * Kept on the profile so a reading can be taken apart after the fact, not just
 * while it is being watched. Outputs are flattened to short readable pairs and
 * never carry lyrics or credentials.
 */
export interface TraceEntry {
  stage: string;
  /** `fetch` asked something outside the app; `derive` computed from what it had. */
  kind: 'fetch' | 'derive';
  provider: string;
  /** What was asked, e.g. an endpoint and the key it was looked up by. */
  request?: string;
  status: 'ok' | 'empty' | 'error' | 'skipped' | 'cached';
  ms?: number;
  /** For derived entries, the inputs that fed it. */
  inputs?: string[];
  output?: Record<string, string | number>;
  note?: string;
  at: number;
}

/** Spotify-style features, as ReccoBeats serves them. All 0-1 unless noted. */
export interface ReccoBeatsFeatures {
  valence: number;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  /** Decibels, typically -60 to 0. */
  loudness: number;
  /** Beats per minute. */
  tempo: number;
  key?: number;
  mode?: number;
  /** How the track was found: by its Spotify id or by ISRC. */
  matchedBy: 'spotify' | 'isrc';
  trackId: string;
}

/**
 * AcousticBrainz high-level classifier outputs, each the probability of the
 * positive class. The project stopped collecting in 2022, so these exist only
 * for recordings submitted before then.
 */
export interface AcousticBrainzFeatures {
  danceable?: number;
  happy?: number;
  sad?: number;
  aggressive?: number;
  relaxed?: number;
  party?: number;
  acoustic?: number;
  electronic?: number;
  /** Probability the timbre classifier called it bright. */
  bright?: number;
  bpm?: number;
  /** How many independent submissions exist for the recording. */
  submissions?: number;
  mbid: string;
}

/** Raw measured audio, kept per source so fusion can always be recomputed. */
export interface AudioEvidence {
  reccobeats?: ReccoBeatsFeatures;
  acousticbrainz?: AcousticBrainzFeatures;
  /** Development catalogue values, standing in for a measured source. */
  mock?: {
    energy?: number;
    brightness?: number;
    danceability?: number;
    acousticness?: number;
    bpm?: number;
  };
  /** When the sources were last asked, so a backfill does not re-ask forever. */
  checkedAt: number;
}

/**
 * The descriptor ranking a reading came from, rounded and stored so the axes
 * inferred from it can be recomputed without embedding anything again.
 */
export interface DescriptorReading {
  /** Descriptor id to similarity, from title, artist, genres and tags. */
  signal: Record<string, number>;
  /** Descriptor id to similarity, from the lyrics alone. */
  lyrics?: Record<string, number>;
  /**
   * The mood the analysis itself chose, after blending and audio. A profile
   * whose mood differs from this was changed by hand.
   */
  mood?: string;
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

  /**
   * Hand-placed positions on the Weave's eight scales, keyed by axis id.
   *
   * Written only from the breakdown screen. An absent key means nobody has
   * placed that axis, which is why this is partial rather than a filled record
   * of centres: analysis must never be able to forge an opinion here.
   */
  axes?: Partial<Record<AxisId, number>>;

  /** Measured audio from every source that answered. */
  audio?: AudioEvidence;
  /** The ranking the descriptors were chosen from. */
  reading?: DescriptorReading;
  /** What the analysis asked and worked out, in order. Development aid. */
  trace?: TraceEntry[];

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
  /**
   * Cover art the playlist arrived with, when it was imported from somewhere
   * that had one. Playlists made here have none and get a generated material.
   */
  coverUrl?: string;

  songIds: string[];

  keywordEmbedding?: number[];
  centroidEmbedding?: number[];
  /** Recipe version the stored vectors were built with. */
  vectorVersion?: number;

  /**
   * How much each part of a match counts for this playlist in particular,
   * learned from which parts separate its own songs from the rest of the
   * library. Absent until the library has been measured.
   */
  weighting?: PlaylistWeighting;

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
  /** The configured weight before this playlist's factor and reliability. */
  baseWeight?: number;
  /** This playlist's learned multiplier for the component. */
  factor?: number;
  /** How trustworthy the song's evidence for this component was, 0-1. */
  reliability?: number;
  /** Per-axis working for the axes component. Development aid. */
  axes?: AxisMatchDetail[];
}

export interface AxisMatchDetail {
  axis: string;
  song: number;
  songSource: string;
  songConfidence: number;
  median: number;
  low: number;
  high: number;
  /** How much this axis counted for this playlist, normalised. */
  importance: number;
  score: number;
}

/**
 * A playlist's learned emphasis.
 *
 * `lift` is how much better the playlist's own songs score on a component than
 * the rest of the library does, in points. A component its members win on by
 * a wide margin is what defines the playlist; one where they score no better
 * than anything else is noise for it.
 */
export interface PlaylistWeighting {
  factors: Record<string, number>;
  lifts: Record<string, number>;
  /** Read members the lifts were measured over. */
  members: number;
  measuredAt: number;
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
