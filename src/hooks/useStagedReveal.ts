import { useEffect, useRef, useState } from 'react';

interface StagedRevealOptions<T> {
  /** How long the step just revealed stays on screen before the next appears. */
  holdFor: (item: T, index: number) => number;
  /** Delay before the very first step appears. */
  initialMs?: number;
  /** Reveal everything immediately, for reduced motion. */
  immediate?: boolean;
}

/**
 * Paces how fast completed steps are shown, without touching the work itself.
 *
 * With embeddings cached an analysis can finish in well under a second, which
 * leaves nothing readable on screen. This releases already-completed steps one
 * at a time, holding each for as long as its content takes to read. It never
 * delays or reorders the pipeline, and never shows a step that has not
 * genuinely finished; it only paces the display of results that already exist.
 */
export function useStagedReveal<T>(
  completed: T[],
  options: StagedRevealOptions<T>,
): number {
  const { initialMs = 400, immediate = false } = options;
  const [count, setCount] = useState(0);
  const lastReleaseRef = useRef(0);
  const holdForRef = useRef(options.holdFor);

  // Kept in a ref so an inline callback does not restart the timer on every
  // render, which would stop the sequence from ever advancing.
  useEffect(() => {
    holdForRef.current = options.holdFor;
  });

  useEffect(() => {
    if (immediate || count >= completed.length) return;

    const hold =
      count === 0 ? initialMs : holdForRef.current(completed[count - 1], count - 1);
    const wait = Math.max(0, hold - (Date.now() - lastReleaseRef.current));

    const timer = setTimeout(() => {
      lastReleaseRef.current = Date.now();
      setCount((current) => Math.min(current + 1, completed.length));
    }, wait);

    return () => clearTimeout(timer);
  }, [completed, count, initialMs, immediate]);

  return immediate ? completed.length : count;
}
