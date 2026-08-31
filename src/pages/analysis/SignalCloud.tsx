import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import type { AnalysisState } from '../../features/analysis/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface SignalCloudProps {
  state: AnalysisState | null;
}

interface SignalTerm {
  key: string;
  label: string;
  source: 'metadata' | 'community' | 'lyrics' | 'interpretation';
}

/** Stable per-term offsets keep the cloud from reading as a tidy grid. */
function offsetFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 100) / 100 - 0.5) * 18;
}

/**
 * The gathered signals, revealed where they belong in the sequence.
 *
 * Community tags and lyric themes surface as loose floating terms; once
 * interpretation completes they are replaced by the descriptors they became,
 * which is the visual moment of the signals merging.
 */
export function SignalCloud({ state }: SignalCloudProps) {
  const reducedMotion = useReducedMotion();

  const interpreted = Boolean(state?.descriptors.length);

  const terms = useMemo<SignalTerm[]>(() => {
    if (!state) return [];

    if (interpreted) {
      return state.descriptors.slice(0, 9).map((label) => ({
        key: `d:${label}`,
        label,
        source: 'interpretation' as const,
      }));
    }

    return [
      ...state.genres.slice(0, 3).map((label) => ({
        key: `g:${label}`,
        label,
        source: 'metadata' as const,
      })),
      ...state.communityTags.slice(0, 7).map((label) => ({
        key: `c:${label}`,
        label,
        source: 'community' as const,
      })),
      ...state.lyricThemes.slice(0, 3).map((label) => ({
        key: `l:${label}`,
        label,
        source: 'lyrics' as const,
      })),
    ];
  }, [state, interpreted]);

  return (
    <div className={`signals${interpreted ? ' signals--merged' : ''}`}>
      <AnimatePresence mode="popLayout">
        {terms.map((term, index) => (
          <motion.span
            key={term.key}
            className={`signals__term signals__term--${term.source} u-rise`}
            /*
              Terms appear via the CSS reveal on the class, so they are never
              stranded invisible. Motion owns only the exit, which is the moment
              the signals are absorbed into the song.
            */
            initial={false}
            animate={{
              opacity: 1,
              y: reducedMotion ? 0 : offsetFor(term.key) * 0.5,
              scale: 1,
            }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : // Terms collapse upward toward the song as they are absorbed.
                  { opacity: 0, y: -34, scale: 0.82, filter: 'blur(3px)' }
            }
            style={
              { '--rise-delay': `${Math.min(index * 50, 400)}ms` } as CSSProperties
            }
            transition={{
              duration: reducedMotion ? 0.15 : 0.62,
              ease: [0.16, 0.84, 0.28, 1],
            }}
          >
            {term.label}
          </motion.span>
        ))}
      </AnimatePresence>

      {state && !interpreted && terms.length === 0 && (
        <span className="signals__waiting u-meta">Gathering signals</span>
      )}
    </div>
  );
}
