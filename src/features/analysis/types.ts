import type { Song, SongProfile } from '../../types';

export type AnalysisStage =
  | 'identify'
  | 'metadata'
  | 'community'
  | 'lyrics'
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
  descriptors: string[];
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
