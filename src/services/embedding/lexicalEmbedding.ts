import { EMBEDDING_CONFIG } from '../../config/embedding';
import type { EmbeddingProvider } from './types';

/**
 * A deterministic, dependency-free embedder used offline and as the fallback
 * when the neural model is unavailable.
 *
 * It is a hashing vectoriser: whole words plus character trigrams are hashed
 * into a fixed-width vector. That captures lexical overlap and near-spellings
 * only. It is not semantic, but it keeps every screen fully functional with no
 * download, which matters more for the demo path than nuance.
 */

const DIMS = EMBEDDING_CONFIG.fallbackDimensions;

function hash(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function addFeature(vector: Float64Array, feature: string, weight: number): void {
  // Two independent hashes per feature reduce the impact of collisions.
  for (let salt = 0; salt < 2; salt += 1) {
    const h = hash(feature, salt);
    const index = h % DIMS;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    vector[index] += sign * weight;
  }
}

export function lexicalEmbed(text: string): number[] {
  const vector = new Float64Array(DIMS);
  const tokens = tokenize(text);

  for (const token of tokens) {
    addFeature(vector, token, 1);
    const padded = `#${token}#`;
    for (let i = 0; i + 3 <= padded.length; i += 1) {
      addFeature(vector, padded.slice(i, i + 3), 0.35);
    }
  }

  let magnitude = 0;
  for (let i = 0; i < DIMS; i += 1) magnitude += vector[i] * vector[i];
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return Array.from(vector);

  const out = new Array<number>(DIMS);
  for (let i = 0; i < DIMS; i += 1) out[i] = vector[i] / magnitude;
  return out;
}

export const lexicalEmbeddingProvider: EmbeddingProvider = {
  id: 'lexical-v1',
  dimensions: DIMS,
  isReady: () => true,
  async embed(text) {
    return lexicalEmbed(text);
  },
  async embedMany(texts) {
    return texts.map(lexicalEmbed);
  },
};
