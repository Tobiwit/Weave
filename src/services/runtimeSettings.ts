import { readSetting, writeSetting } from '../db/repositories';
import type { EmbeddingMode } from './embedding';

export type ProviderMode = 'auto' | 'mock';

export interface RuntimeSettings {
  /** `auto` uses live providers where configured; `mock` never leaves the device. */
  providerMode: ProviderMode;
  embeddingMode: EmbeddingMode;
  reducedMotionOverride: boolean;
}

const DEFAULTS: RuntimeSettings = {
  providerMode: 'auto',
  embeddingMode: 'auto',
  reducedMotionOverride: false,
};

const KEYS = {
  providerMode: 'providers.mode',
  embeddingMode: 'embedding.mode',
  reducedMotionOverride: 'a11y.reduceMotion',
} as const;

let current: RuntimeSettings = { ...DEFAULTS };
const listeners = new Set<(settings: RuntimeSettings) => void>();

export function getRuntimeSettings(): RuntimeSettings {
  return current;
}

export function subscribeToSettings(
  listener: (settings: RuntimeSettings) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadRuntimeSettings(): Promise<RuntimeSettings> {
  const [providerMode, embeddingMode, reducedMotionOverride] = await Promise.all([
    readSetting<ProviderMode>(KEYS.providerMode, DEFAULTS.providerMode),
    readSetting<EmbeddingMode>(KEYS.embeddingMode, DEFAULTS.embeddingMode),
    readSetting<boolean>(KEYS.reducedMotionOverride, DEFAULTS.reducedMotionOverride),
  ]);
  current = { providerMode, embeddingMode, reducedMotionOverride };
  for (const listener of listeners) listener(current);
  return current;
}

export async function updateRuntimeSettings(
  patch: Partial<RuntimeSettings>,
): Promise<RuntimeSettings> {
  current = { ...current, ...patch };
  await Promise.all(
    (Object.keys(patch) as (keyof RuntimeSettings)[]).map((key) =>
      writeSetting(KEYS[key], current[key]),
    ),
  );
  for (const listener of listeners) listener(current);
  return current;
}
