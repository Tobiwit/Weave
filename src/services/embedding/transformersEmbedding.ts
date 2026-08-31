import { EMBEDDING_CONFIG } from '../../config/embedding';
import type {
  EmbeddingProgress,
  EmbeddingProgressListener,
  EmbeddingProvider,
} from './types';

/**
 * Browser-side sentence embeddings via transformers.js.
 *
 * The library and the model weights are both loaded lazily on first use so
 * nothing is downloaded when the app boots. The pipeline is cached for the
 * lifetime of the tab.
 */

type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let pipelinePromise: Promise<FeatureExtractor> | null = null;
let ready = false;

const listeners = new Set<EmbeddingProgressListener>();

function emit(progress: EmbeddingProgress): void {
  for (const listener of listeners) listener(progress);
}

export function onEmbeddingProgress(listener: EmbeddingProgressListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadPipeline(): Promise<FeatureExtractor> {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    emit({ status: 'downloading', message: 'Preparing your analyzer' });
    const { pipeline } = await import('@huggingface/transformers');

    const extractor = await pipeline(
      'feature-extraction',
      EMBEDDING_CONFIG.modelId,
      {
        dtype: EMBEDDING_CONFIG.dtype,
        progress_callback: (event: { status?: string; progress?: number }) => {
          if (event.status === 'progress' && typeof event.progress === 'number') {
            emit({
              status: 'downloading',
              progress: Math.min(1, event.progress / 100),
              message: 'Preparing your analyzer',
            });
          }
        },
      },
    );

    emit({ status: 'ready' });
    ready = true;
    return extractor as unknown as FeatureExtractor;
  })();

  try {
    return await pipelinePromise;
  } catch (error) {
    pipelinePromise = null;
    ready = false;
    emit({
      status: 'error',
      message: error instanceof Error ? error.message : 'Model unavailable',
    });
    throw error;
  }
}

export const transformersEmbeddingProvider: EmbeddingProvider = {
  id: `hf:${EMBEDDING_CONFIG.modelId}`,
  dimensions: EMBEDDING_CONFIG.dimensions,
  isReady: () => ready,
  async prepare(onProgress) {
    const off = onProgress ? onEmbeddingProgress(onProgress) : undefined;
    try {
      await loadPipeline();
    } finally {
      off?.();
    }
  },
  async embed(text) {
    const [vector] = await this.embedMany([text]);
    return vector;
  },
  async embedMany(texts) {
    if (texts.length === 0) return [];
    const extractor = await loadPipeline();
    const output = await extractor(texts, {
      pooling: EMBEDDING_CONFIG.pooling,
      normalize: EMBEDDING_CONFIG.normalize,
    });
    return output.tolist();
  },
};
