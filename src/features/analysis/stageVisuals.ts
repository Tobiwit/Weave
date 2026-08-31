import { NEUTRAL_MOOD, blendMoodState, moodStateFromProfile } from '../mood/moodVisualState';
import type { MoodVisualState } from '../../types';
import type { AnalysisStage, AnalysisState } from './types';

/**
 * How the analysis scene reacts to real pipeline progress.
 *
 * Each signal source owns a stream of points. A stream arrives as its stage
 * completes, so the cloud visibly gains material as data actually lands rather
 * than animating on a timer.
 */
const STREAM_STAGES: AnalysisStage[] = [
  'identify',
  'metadata',
  'community',
  'lyrics',
  'interpret',
];

export function cloudStreams(state: AnalysisState | null): number[] {
  return STREAM_STAGES.map((stage) => {
    if (!state) return stage === 'identify' ? 0.35 : 0;
    if (state.completedStages.includes(stage)) return 1;
    if (state.stage === stage) return 0.42;
    return 0;
  });
}

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

/** The cloud tightens as the reading resolves into one interpretation. */
export function cloudConvergence(state: AnalysisState | null): number {
  if (!state) return 0;
  if (state.stage === 'complete') return 1;
  if (state.stage === 'fingerprint') return 0.86;
  if (state.stage === 'interpret') return 0.5;
  return Math.max(0, stageResolution(state) - 0.28);
}

/** Rotation speed: unhurried while gathering, a touch quicker as it resolves. */
export function cloudSpeed(state: AnalysisState | null): number {
  if (!state) return 0.28;
  if (state.stage === 'interpret') return 0.72;
  if (state.stage === 'fingerprint' || state.stage === 'complete') return 0.4;
  return 0.34 + stageResolution(state) * 0.3;
}

/**
 * The environment evolves rather than cutting: it starts vague and neutral,
 * then leans toward the interpreted mood once one exists.
 */
export function sceneMood(state: AnalysisState | null): MoodVisualState {
  if (!state) return NEUTRAL_MOOD;
  if (state.profile) return moodStateFromProfile(state.profile);

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
