import { useEffect, useRef, useState } from 'react';
import { searchSongs } from '../services/search';
import type { Song } from '../types';

interface SearchState {
  results: Song[];
  loading: boolean;
  /** Set when a live provider failed and local results are being shown. */
  degraded: boolean;
}

interface Outcome {
  /** The query these results answer, used to derive loading during render. */
  query: string;
  results: Song[];
  degraded: boolean;
}

const DEBOUNCE_MS = 260;
const MIN_LENGTH = 2;

export function useSongSearch(query: string): SearchState {
  const [outcome, setOutcome] = useState<Outcome>({
    query: '',
    results: [],
    degraded: false,
  });
  const controllerRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_LENGTH;

  useEffect(() => {
    controllerRef.current?.abort();
    if (trimmed.length < MIN_LENGTH) return;

    const controller = new AbortController();
    controllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const result = await searchSongs(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        setOutcome({
          query: trimmed,
          results: result.songs,
          degraded: result.degraded,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setOutcome({ query: trimmed, results: [], degraded: true });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // Loading is derived, not stored: we are loading whenever the results on hand
  // answer a different query than the one being typed.
  if (!active) return { results: [], loading: false, degraded: false };

  return {
    results: outcome.query === trimmed ? outcome.results : [],
    loading: outcome.query !== trimmed,
    degraded: outcome.query === trimmed && outcome.degraded,
  };
}
