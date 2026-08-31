import type { Song, SongProfile } from '../../types';
import { runSongAnalysis } from './runSongAnalysis';
import type { AnalysisListener, AnalysisState } from './types';

interface ActiveRun {
  state: AnalysisState | null;
  listeners: Set<AnalysisListener>;
  promise: Promise<SongProfile>;
  error?: Error;
}

const runs = new Map<string, ActiveRun>();

/** How long a finished run stays available for a remounting page to read. */
const RETENTION_MS = 4000;

/**
 * Keeps one analysis per song, shared by every observer.
 *
 * A component can mount, unmount and remount, as it does under StrictMode,
 * without restarting the pipeline or firing the same network requests twice.
 * The run owns its lifetime; observers only come and go.
 */
export function observeSongAnalysis(
  song: Song,
  listener: AnalysisListener,
  onError?: (error: Error) => void,
): () => void {
  let run = runs.get(song.id);

  if (!run) {
    const created: ActiveRun = {
      state: null,
      listeners: new Set(),
      promise: undefined as unknown as Promise<SongProfile>,
    };

    created.promise = runSongAnalysis(song, {
      onUpdate: (state) => {
        created.state = state;
        for (const observer of created.listeners) observer(state);
      },
    });

    created.promise
      .then(() => {
        // Held briefly so a remount sees the finished state, then released so a
        // later visit runs a fresh analysis.
        setTimeout(() => runs.delete(song.id), RETENTION_MS);
      })
      .catch((error: Error) => {
        created.error = error;
        runs.delete(song.id);
      });

    runs.set(song.id, created);
    run = created;
  }

  run.listeners.add(listener);
  if (run.state) listener(run.state);

  const current = run;
  if (onError) {
    current.promise.catch((error: Error) => {
      if (current.listeners.has(listener)) onError(error);
    });
  }

  return () => {
    current.listeners.delete(listener);
  };
}
