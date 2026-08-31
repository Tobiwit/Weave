import type { Song } from '../../types';
import type { AnalysisStage, AnalysisState } from './types';

export type StepStatus = 'waiting' | 'active' | 'done' | 'missing';

export interface StepView {
  id: AnalysisStage;
  label: string;
  status: StepStatus;
  detail?: string;
  /** Shown as separate terms rather than one run-on line. */
  terms?: string[];
}

export const STEP_ORDER: AnalysisStage[] = [
  'identify',
  'metadata',
  'community',
  'lyrics',
  'interpret',
  'fingerprint',
];

export const STEP_LABELS: Record<AnalysisStage, string> = {
  identify: 'Song',
  metadata: 'Release',
  community: 'Community',
  lyrics: 'Lyrics',
  interpret: 'Interpretation',
  fingerprint: 'Fingerprint',
  complete: 'Complete',
};

const PENDING: Record<AnalysisStage, string> = {
  identify: 'Confirming what this is',
  metadata: 'Looking up the release',
  community: 'Reading what listeners call it',
  lyrics: 'Reading between the lines',
  interpret: 'Weaving the signals together',
  fingerprint: 'Settling into shape',
  complete: '',
};

/**
 * How long a revealed step stays on screen before the next one appears.
 *
 * A step that surfaced six community tags needs longer to read than one that
 * printed a single line, so the hold scales with what was actually retrieved.
 * These are the numbers to change if the sequence feels slow or rushed.
 */
export const STEP_PACING = {
  /** Before the very first step appears. */
  initialMs: 420,
  /** Floor for any step, however little it revealed. */
  baseMs: 700,
  /** Added per term shown. */
  perTermMs: 150,
  /** Ceiling, so a tag-heavy song cannot stall the sequence. */
  maxMs: 2200,
} as const;

export function readingTimeFor(state: AnalysisState | null, stage: AnalysisStage): number {
  const step = describeStep(state, null, stage, 'done');
  const terms = step.terms?.length ?? 0;
  return Math.min(
    STEP_PACING.maxMs,
    STEP_PACING.baseMs + terms * STEP_PACING.perTermMs,
  );
}

/**
 * Builds the visible process list.
 *
 * Exactly one step is ever active: the next one due to be revealed. The list
 * then marches down at a readable pace instead of lighting up all at once when
 * a cached run finishes almost immediately.
 */
export function buildSteps(
  state: AnalysisState | null,
  song: Song | null,
  revealedCount: number,
): StepView[] {
  return STEP_ORDER.map((id, index) => {
    const status: StepStatus =
      index < revealedCount ? 'done' : index === revealedCount ? 'active' : 'waiting';
    return describeStep(state, song, id, status);
  });
}

function describeStep(
  state: AnalysisState | null,
  song: Song | null,
  id: AnalysisStage,
  status: StepStatus,
): StepView {
  const base: StepView = { id, label: STEP_LABELS[id], status };
  if (status === 'waiting') return base;
  if (status === 'active') return { ...base, detail: PENDING[id] };

  const noticeFor = (stage: AnalysisStage) =>
    state?.notices.find((notice) => notice.stage === stage)?.message;

  switch (id) {
    case 'identify':
      return {
        ...base,
        detail: song
          ? [song.artist, song.album].filter(Boolean).join(' · ')
          : 'Identified',
      };

    case 'metadata':
      if (state?.genres.length) return { ...base, terms: state.genres };
      return {
        ...base,
        status: 'missing',
        detail: noticeFor('metadata') ?? 'No release details for this one.',
      };

    case 'community':
      if (state?.communityTags.length) {
        return { ...base, terms: state.communityTags.slice(0, 6) };
      }
      return {
        ...base,
        status: 'missing',
        detail: noticeFor('community') ?? 'No community tags for this one.',
      };

    case 'lyrics':
      if (state?.lyricThemes.length) return { ...base, terms: state.lyricThemes };
      if (state?.lyricsAvailable) return { ...base, detail: 'Read, nothing distinct' };
      return {
        ...base,
        status: 'missing',
        detail: 'Lyrics unavailable. The rest of the reading continues.',
      };

    case 'interpret':
      if (state?.preparing) {
        return {
          ...base,
          status: 'active',
          detail: preparingCopy(state.preparing.progress),
        };
      }
      if (state?.descriptors.length) {
        return { ...base, terms: state.descriptors.slice(0, 6) };
      }
      return { ...base, detail: 'Interpreted' };

    case 'fingerprint':
      return {
        ...base,
        detail: state?.profile?.mood ? `${state.profile.mood} · ready` : 'Ready',
      };

    default:
      return base;
  }
}

function preparingCopy(progress?: number): string {
  if (typeof progress !== 'number') return 'Preparing your analyzer';
  return `Preparing your analyzer · ${Math.round(progress * 100)}%`;
}
