import { useSyncExternalStore } from 'react';
import {
  getReadingQueueState,
  subscribeToReadingQueue,
  type ReadingQueueState,
} from '../features/analysis/readingQueue';

/**
 * The background reading queue, as a React value.
 *
 * `subscribeToReadingQueue` calls back immediately on subscribe, which
 * `useSyncExternalStore` does not expect, so the snapshot is read separately
 * and the emitted state is ignored here.
 */
export function useReadingQueue(): ReadingQueueState {
  return useSyncExternalStore(
    (onChange) => subscribeToReadingQueue(() => onChange()),
    getReadingQueueState,
    getReadingQueueState,
  );
}
