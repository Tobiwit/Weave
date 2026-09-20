import { useSyncExternalStore } from 'react';
import {
  getRuntimeSettings,
  subscribeToSettings,
  type RuntimeSettings,
} from '../services/runtimeSettings';

/**
 * Runtime settings as a React value.
 *
 * The store already notifies on change; this only adapts it, so a setting
 * altered on the settings screen reaches the shell without either of them
 * knowing about the other.
 */
export function useRuntimeSettings(): RuntimeSettings {
  return useSyncExternalStore(
    (onChange) => subscribeToSettings(() => onChange()),
    getRuntimeSettings,
    getRuntimeSettings,
  );
}
