import {
  getEmbeddingRecords,
  putEmbeddingRecords,
  readSetting,
} from '../../db/repositories';
import { lexicalEmbeddingProvider } from './lexicalEmbedding';
import {
  onEmbeddingProgress,
  transformersEmbeddingProvider,
} from './transformersEmbedding';
import type { EmbeddingProgressListener, EmbeddingProvider } from './types';

export type { EmbeddingProvider, EmbeddingProgress } from './types';
export { onEmbeddingProgress } from './transformersEmbedding';
export { lexicalEmbeddingProvider } from './lexicalEmbedding';

export type EmbeddingMode = 'auto' | 'neural' | 'lexical';

export const EMBEDDING_MODE_KEY = 'embedding.mode';

let neuralFailed = false;

function stableHash(text: string): string {
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (h2 * 33) ^ c;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

async function resolveMode(): Promise<EmbeddingMode> {
  return readSetting<EmbeddingMode>(EMBEDDING_MODE_KEY, 'auto');
}

/**
 * Picks the underlying provider.
 *
 * `auto` prefers the neural model but degrades to the lexical embedder once the
 * model has failed in this session, so analysis never dead-ends offline.
 */
export async function selectProvider(): Promise<EmbeddingProvider> {
  const mode = await resolveMode();
  if (mode === 'lexical') return lexicalEmbeddingProvider;
  if (mode === 'neural') return transformersEmbeddingProvider;
  return neuralFailed ? lexicalEmbeddingProvider : transformersEmbeddingProvider;
}

/**
 * Cached embedding access. Vectors are persisted per provider so switching
 * models never mixes incompatible spaces.
 */
export const embeddingService = {
  async getProvider(): Promise<EmbeddingProvider> {
    return selectProvider();
  },

  async prepare(onProgress?: EmbeddingProgressListener): Promise<void> {
    const provider = await selectProvider();
    if (!provider.prepare) return;
    try {
      await provider.prepare(onProgress);
    } catch {
      neuralFailed = true;
    }
  },

  async isReady(): Promise<boolean> {
    const provider = await selectProvider();
    return provider.isReady();
  },

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    let provider = await selectProvider();

    const keys = texts.map((text) => `${provider.id}:${stableHash(text)}`);
    const cached = await getEmbeddingRecords(keys);

    const missingIndexes: number[] = [];
    const out = new Array<number[]>(texts.length);
    cached.forEach((record, index) => {
      if (record) out[index] = record.vector;
      else missingIndexes.push(index);
    });

    if (missingIndexes.length > 0) {
      const missingTexts = missingIndexes.map((i) => texts[i]);
      let vectors: number[][];
      try {
        vectors = await provider.embedMany(missingTexts);
      } catch {
        // The neural model could not load or run. Fall back for this call and
        // for the rest of the session; the experience continues either way.
        neuralFailed = true;
        provider = lexicalEmbeddingProvider;
        vectors = await lexicalEmbeddingProvider.embedMany(missingTexts);
      }

      const records = missingIndexes.map((sourceIndex, i) => {
        out[sourceIndex] = vectors[i];
        return {
          key: `${provider.id}:${stableHash(texts[sourceIndex])}`,
          providerId: provider.id,
          vector: vectors[i],
          createdAt: Date.now(),
        };
      });
      await putEmbeddingRecords(records).catch(() => undefined);
    }

    return out;
  },

  async embed(text: string): Promise<number[]> {
    const [vector] = await embeddingService.embedMany([text]);
    return vector ?? [];
  },
};

/** Convenience re-export so callers can subscribe without importing the adapter. */
export const subscribeToEmbeddingProgress = onEmbeddingProgress;
