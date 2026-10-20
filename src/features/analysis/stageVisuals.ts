import { NEUTRAL_MOOD, blendMoodState, moodStateFromProfile } from '../mood/moodVisualState';
import type { MoodVisualState } from '../../types';
import type { AnalysisStage, AnalysisState } from './types';

/**
 * How the reading's surroundings follow real pipeline progress.
 */

/** How far the run has progressed, used to resolve the background. */
export function stageResolution(state: AnalysisState | null): number {
  if (!state) return 0.24;
  const weights: Record<AnalysisStage, number> = {
    identify: 0.3,
    metadata: 0.42,
    community: 0.56,
    lyrics: 0.64,
    audio: 0.74,
    interpret: 0.84,
    fingerprint: 0.96,
    complete: 1,
  };
  return weights[state.stage] ?? 0.3;
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
