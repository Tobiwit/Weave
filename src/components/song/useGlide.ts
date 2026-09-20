import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/** Decelerating, with no overshoot: the weave settles, it does not bounce. */
const ease = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Follows a set of numbers instead of snapping to them.
 *
 * Every restart tweens from wherever the previous one had got to, so dragging a
 * value produces one continuous motion rather than a queue of little
 * animations. Reduced motion skips the tween entirely, and so does any change
 * in how many numbers there are, because there is no sensible path between
 * differently shaped sets.
 */
export function useGlide(target: number[], duration = 420): number[] {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const signature = target.join(',');

  useEffect(() => {
    const from = shownRef.current;

    if (reducedMotion || from.length !== target.length) {
      shownRef.current = target;
      setShown(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = ease(progress);
      const next = target.map((value, index) => {
        const start = from[index];
        return start + (value - start) * eased;
      });
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // `signature` stands in for the contents of `target`, which is a new array
    // on every render and would otherwise restart the tween forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reducedMotion, duration]);

  return shown;
}
