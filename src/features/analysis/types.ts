import type { Song, SongProfile, TraceEntry } from '../../types';

export type AnalysisStage =
  | 'identify'
  | 'metadata'
  | 'community'
  | 'lyrics'
  | 'audio'
  | 'interpret'
  | 'fingerprint'
  | 'complete';

export interface AnalysisNotice {
  stage: AnalysisStage;
  /** Human copy. Never a raw technical error. */
  message: string;
}

export interface AnalysisState {
  song: Song;
  stage: AnalysisStage;
  completedStages: AnalysisStage[];
  /** Signals revealed so far, in the order the UI should surface them. */
  genres: string[];
  communityTags: string[];
  lyricsAvailable: boolean;
  lyricThemes: string[];
  /** Which audio sources answered, e.g. `reccobeats`. Empty when none did. */
  audioSources: string[];
  descriptors: string[];
  /** Every source asked and every value worked out so far, in order. */
  trace: TraceEntry[];
  notices: AnalysisNotice[];
  profile?: SongProfile;
  /** Set only when the song itself could not be established. */
  fatalError?: string;
  /** Present while the embedding model is being downloaded for the first time. */
  preparing?: { progress?: number };
  startedAt: number;
  finishedAt?: number;
}

export type AnalysisListener = (state: AnalysisState) => void;
