import { DESCRIPTORS, descriptorEmbeddingText } from '../../data/descriptors';
import { embeddingService } from '../../services/embedding';
import {
  buildSourceText,
  rankDescriptors,
  selectDescriptors,
  type ScoredDescriptor,
  type SignalInput,
} from './descriptorRanking';

export type { ScoredDescriptor, SignalInput as InterpretationInput } from './descriptorRanking';
export { buildSourceText, rankDescriptors, topOfGroup } from './descriptorRanking';

export interface Interpretation {
  sourceText: string;
  embedding: number[];
  ranked: ScoredDescriptor[];
  mood?: string;
  vibes: string[];
  themes: string[];
  /** Inferred, never presented as measured. */
  energy: number;
  intensity: number;
}

let descriptorVectorsPromise: Promise<number[][]> | null = null;

/** Descriptor embeddings are identical for every song, so compute them once. */
export async function getDescriptorVectors(): Promise<number[][]> {
  if (!descriptorVectorsPromise) {
    descriptorVectorsPromise = embeddingService
      .embedMany(DESCRIPTORS.map(descriptorEmbeddingText))
      .catch((error) => {
        descriptorVectorsPromise = null;
        throw error;
      });
  }
  return descriptorVectorsPromise;
}

/** Embeds the song's signals and reads them against the descriptor vocabulary. */
export async function interpretSignals(input: SignalInput): Promise<Interpretation> {
  const sourceText = buildSourceText(input);
  const [embedding, descriptorVectors] = await Promise.all([
    embeddingService.embed(sourceText),
    getDescriptorVectors(),
  ]);

  const ranked = rankDescriptors(embedding, descriptorVectors);
  const selection = selectDescriptors(ranked);

  return { sourceText, embedding, ranked, ...selection };
}
