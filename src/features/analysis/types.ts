import type { Song, SongProfile } from '../../types';

export type AnalysisStage =
  | 'identify'
  | 'metadata'
  | 'community'
  | 'lyrics'
  | 'interpret'
  | 'fingerprint'
  | 'complete';

/** The four groupings shown in the minimal progress indicator. */
export const STAGE_PHASES: { id: string; label: string; stages: AnalysisStage[] }[] = [
  { id: 'identify', label: 'Identify', stages: ['identify'] },
  { id: 'gather', label: 'Gather', stages: ['metadata', 'community', 'lyrics'] },
  { id: 'interpret', label: 'Interpret', stages: ['interpret'] },
  { id: 'fingerprint', label: 'Fingerprint', stages: ['fingerprint', 'complete'] },
];

export const STAGE_ORDER: AnalysisStage[] = [
  'identify',
  'metadata',
  'community',
  'lyrics',
  'interpret',
  'fingerprint',
  'complete',
];

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
