import { useEffect, useState } from 'react';
import { getRuntimeSettings, subscribeToSettings } from '../services/runtimeSettings';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the system asks for reduced motion, or when the user has turned it
 * on inside the app.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia(QUERY).matches ||
      getRuntimeSettings().reducedMotionOverride
    );
  });

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () =>
      setReduced(media.matches || getRuntimeSettings().reducedMotionOverride);

    media.addEventListener('change', update);
    const unsubscribe = subscribeToSettings(update);
    update();

    return () => {
      media.removeEventListener('change', update);
      unsubscribe();
    };
  }, []);

  return reduced;
}
