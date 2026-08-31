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
 * Each step reports what was actually retrieved, so the reading is transparent
 * rather than a spinner with a result at the end. Steps that found nothing say
 * so plainly and the run carries on.
 */
export function AnalysisSteps({ state, song, revealedCount }: AnalysisStepsProps) {
  const steps = buildSteps(state, song, revealedCount);
  const activeRef = useRef<HTMLLIElement>(null);
  const reducedMotion = useReducedMotion();
  const activeId = steps.find((step) => step.status === 'active')?.id;

  // On a short screen the list outgrows its box, so the step currently being
  // worked on is kept in view rather than left below the fold.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeId, reducedMotion]);

  return (
    <ol className="steps" aria-label="Analysis progress">
      {steps.map((step, index) => (
        <li
          key={step.id}
          ref={step.status === 'active' ? activeRef : undefined}
          className={`step step--${step.status}${
            index === steps.length - 1 ? ' step--last' : ''
          }`}
        >
          <span className="step__rail" aria-hidden="true">
            <span className="step__dot" />
          </span>

          <span className="step__body">
            <span className="step__label">{STEP_LABELS[step.id]}</span>

            {step.terms && step.terms.length > 0 ? (
              <span className="step__terms">
                {step.terms.map((term, termIndex) => (
                  <span
                    key={term}
                    className="step__term u-rise"
                    style={{ ['--rise-delay' as string]: `${termIndex * 70}ms` }}
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
