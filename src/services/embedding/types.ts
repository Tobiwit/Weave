export interface EmbeddingProgress {
  /** 0-1 where known, otherwise undefined for indeterminate work. */
  progress?: number;
  status: 'idle' | 'downloading' | 'preparing' | 'ready' | 'error';
  message?: string;
}

export type EmbeddingProgressListener = (progress: EmbeddingProgress) => void;

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  /** True when embedding will not require any further loading. */
  isReady(): boolean;
  /** Optional warm-up so the UI can show a one-time preparing state. */
  prepare?(onProgress?: EmbeddingProgressListener): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}
