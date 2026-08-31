import type { FlowConnection, FlowNode } from '../../components/flow/FlowField';
import { NEUTRAL_MOOD, blendMoodState, moodStateFromProfile } from '../mood/moodVisualState';
import type { MoodVisualState } from '../../types';
import type { AnalysisState, AnalysisStage } from './types';

/**
 * The scene geometry for the analysis.
 *
 * Sources sit in distinct regions of the field and lean toward the song at the
 * centre, so signals visibly arrive from different directions rather than
 * appearing in a list.
 */
export const SCENE_NODES: FlowNode[] = [
  { id: 'song', x: 0.5, y: 0.44, intensity: 1 },
  { id: 'metadata', x: 0.13, y: 0.12 },
  { id: 'community', x: 0.9, y: 0.24 },
  { id: 'lyrics', x: 0.08, y: 0.78 },
  { id: 'sound', x: 0.93, y: 0.74 },
];

const SOURCE_STAGES: Record<string, AnalysisStage> = {
  metadata: 'metadata',
  community: 'community',
  lyrics: 'lyrics',
  sound: 'lyrics',
};

/** How far the run has progressed, used to resolve the background. */
export function stageResolution(state: AnalysisState | null): number {
  if (!state) return 0.24;
  const weights: Record<AnalysisStage, number> = {
    identify: 0.3,
    metadata: 0.42,
    community: 0.56,
    lyrics: 0.68,
    interpret: 0.84,
    fingerprint: 0.96,
    complete: 1,
  };
  return weights[state.stage] ?? 0.3;
}

export function sceneConnections(state: AnalysisState | null): FlowConnection[] {
  return Object.entries(SOURCE_STAGES).map(([source, stage]) => {
    const done = state?.completedStages.includes(stage) ?? false;
    const active = state?.stage === stage;
    return {
      from: source,
      to: 'song',
      strength: done ? 0.75 : active ? 0.5 : 0.16,
      active: active || done,
    };
  });
}

/**
 * The environment evolves rather than cutting: it starts vague and neutral,
 * then leans toward the interpreted mood once one exists.
 */
export function sceneMood(state: AnalysisState | null): MoodVisualState {
  if (!state) return NEUTRAL_MOOD;
  if (state.profile) {
    return moodStateFromProfile(state.profile);
  }

  // Before interpretation, activity alone warms and thickens the field.
  const progress = stageResolution(state);
  const activated: MoodVisualState = {
    ...NEUTRAL_MOOD,
    density: 0.34 + progress * 0.3,
    contrast: 0.26 + progress * 0.24,
    motion: 0.22 + progress * 0.28,
    turbulence: 0.2 + progress * 0.25,
  };
  return blendMoodState(NEUTRAL_MOOD, activated, progress);
}

export const STAGE_CAPTIONS: Record<AnalysisStage, string> = {
  identify: 'Finding the song',
  metadata: 'Reading its release',
  community: 'Listening to what people call it',
  lyrics: 'Reading between the lines',
  interpret: 'Weaving the signals together',
  fingerprint: 'Settling into shape',
  complete: 'Ready',
};
