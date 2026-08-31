import { useEffect, useState } from 'react';
import { getSong } from '../db/repositories';
import { observeSongAnalysis } from '../features/analysis/analysisRegistry';
import type { AnalysisState } from '../features/analysis/types';
import type { Song } from '../types';

interface UseSongAnalysisResult {
  state: AnalysisState | null;
  song: Song | null;
  /** Set only when the song itself could not be loaded or identified. */
  error: string | null;
}

/**
 * Streams the real stage progress of a song analysis into React state.
 *
 * The run itself lives in the registry, so remounting attaches to the existing
 * analysis rather than starting a second one. No simulated progress anywhere.
 */
export function useSongAnalysis(songId: string | undefined): UseSongAnalysisResult {
  const [state, setState] = useState<AnalysisState | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!songId) return;

    let cancelled = false;
    let detach: (() => void) | undefined;

    const start = async () => {
      const stored = await getSong(songId);
      if (cancelled) return;
      if (!stored) {
        setError('We could not find that song.');
        return;
      }
      setSong(stored);

      detach = observeSongAnalysis(
        stored,
        (next) => {
          if (!cancelled) setState(next);
        },
        () => {
          if (!cancelled) setError('We could not identify this song.');
        },
      );
    };

    void start();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [songId]);

  // The run enriches the song as it goes, most visibly with cover art, so the
  // freshest copy wins over the one first loaded from storage.
  return { state, song: state?.song ?? song, error };
}
