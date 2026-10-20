import { useEffect, useRef } from 'react';
import { buildSteps, STEP_LABELS } from '../../features/analysis/analysisSteps';
import type { AnalysisState } from '../../features/analysis/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { Song } from '../../types';

interface AnalysisStepsProps {
  state: AnalysisState | null;
  song: Song | null;
  /** How many steps have been cleared for display, paced by useStagedReveal. */
  revealedCount: number;
}

/**
 * The process, shown as it happens.
 *
 * Each step reports what was actually retrieved. A step that found nothing
 * says so plainly and the run carries on. The marker on the left is a half
 * circle in every state: turning while the step works, closed into a full
 * circle when it is done, left open when its source had nothing.
 */
export function AnalysisSteps({ state, song, revealedCount }: AnalysisStepsProps) {
  const steps = buildSteps(state, song, revealedCount);
  const activeRef = useRef<HTMLLIElement>(null);
  const reducedMotion = useReducedMotion();
  const activeId = steps.find((step) => step.status === 'active')?.id;

  // Keeps the step being worked on in view by scrolling only the list that
  // holds it. scrollIntoView would also scroll the page, pushing the mark away.
  useEffect(() => {
    const step = activeRef.current;
    const list = step?.closest<HTMLElement>('[data-step-scroller]');
    if (!step || !list) return;
    const top = step.offsetTop - list.offsetTop;
    const bottom = top + step.offsetHeight;
    if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) return;
    list.scrollTo({
      top: Math.max(0, bottom - list.clientHeight + 8),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeId, reducedMotion]);

  return (
    <ol className="steps" aria-label="Reading progress">
      {steps.map((step) => (
        <li
          key={step.id}
          ref={step.status === 'active' ? activeRef : undefined}
          className={`step step--${step.status}`}
        >
          <StepMarker status={step.status} />

          <span className="step__body">
            <span className="step__label">{STEP_LABELS[step.id]}</span>

            {step.terms && step.terms.length > 0 ? (
              <span className="step__terms">
                {step.terms.map((term, termIndex) => (
                  <span
                    key={term}
                    className="step__term u-rise"
                    style={{ ['--rise-delay' as string]: `${termIndex * 60}ms` }}
                  >
                    {term}
                  </span>
                ))}
              </span>
            ) : (
              step.detail && <span className="step__detail">{step.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepMarker({ status }: { status: string }) {
  return (
    <svg className="step__marker" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="step__markerTrack" cx="12" cy="12" r="8" />
      <path className="step__markerTop" d="M4 12a8 8 0 0 1 16 0" />
      <path className="step__markerBottom" d="M20 12a8 8 0 0 1-16 0" />
      {status === 'done' && <circle className="step__markerCore" cx="12" cy="12" r="3" />}
    </svg>
  );
}
