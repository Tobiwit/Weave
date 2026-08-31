import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NEUTRAL_MOOD } from '../../features/mood/moodVisualState';
import type { MoodVisualState } from '../../types';

interface MoodEnvironment {
  state: MoodVisualState;
  resolution: number;
  quality: number;
  transitionMs: number;
}

interface MoodContextValue extends MoodEnvironment {
  setEnvironment: (next: Partial<MoodEnvironment>) => void;
}

const DEFAULT_ENVIRONMENT: MoodEnvironment = {
  state: NEUTRAL_MOOD,
  resolution: 0.8,
  quality: 1,
  transitionMs: 1100,
};

const MoodContext = createContext<MoodContextValue | null>(null);

/**
 * Holds the single background environment for the whole app.
 *
 * One canvas persists across routes so the song environment can carry from the
 * analysis into the fingerprint and on into matching, instead of each screen
 * cutting to an unrelated scene.
 */
export function MoodProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<MoodEnvironment>(
    DEFAULT_ENVIRONMENT,
  );

  const setEnvironment = useCallback((next: Partial<MoodEnvironment>) => {
    setEnvironmentState((current) => {
      const merged = { ...current, ...next };
      const unchanged =
        merged.state === current.state &&
        merged.resolution === current.resolution &&
        merged.quality === current.quality &&
        merged.transitionMs === current.transitionMs;
      return unchanged ? current : merged;
    });
  }, []);

  const value = useMemo(
    () => ({ ...environment, setEnvironment }),
    [environment, setEnvironment],
  );

  return <MoodContext.Provider value={value}>{children}</MoodContext.Provider>;
}

export function useMoodContext(): MoodContextValue {
  const context = useContext(MoodContext);
  if (!context) throw new Error('useMoodContext must be used inside MoodProvider');
  return context;
}

/** Declarative way for a page to own the environment while it is mounted. */
export function useMoodEnvironment(
  state: MoodVisualState,
  options: Partial<Omit<MoodEnvironment, 'state'>> = {},
): void {
  const { setEnvironment } = useMoodContext();
  const { resolution, quality, transitionMs } = options;

  useEffect(() => {
    setEnvironment({
      state,
      resolution: resolution ?? DEFAULT_ENVIRONMENT.resolution,
      quality: quality ?? DEFAULT_ENVIRONMENT.quality,
      transitionMs: transitionMs ?? DEFAULT_ENVIRONMENT.transitionMs,
    });
  }, [state, resolution, quality, transitionMs, setEnvironment]);
}
