import { DESCRIPTORS, descriptorEmbeddingText } from '../../data/descriptors';
import { embeddingService } from '../../services/embedding';
import type { AxisId } from '../song/axes';
import {
  blendRankings,
  buildSignalText,
  condenseLyrics,
  nudgeByAudio,
  rankDescriptors,
  selectDescriptors,
  type ScoredDescriptor,
  type SignalInput,
} from './descriptorRanking';

export type { ScoredDescriptor, SignalInput as InterpretationInput } from './descriptorRanking';
export { buildSignalText, rankDescriptors, topOfGroup } from './descriptorRanking';

export interface Interpretation {
  signalText: string;
  /** Characters of lyrics that were embedded, 0 when there were none. */
  lyricChars: number;
  /** From title, artist, genres and tags alone. */
  signalRanked: ScoredDescriptor[];
  /** From the lyrics alone, when there were any. */
  lyricRanked: ScoredDescriptor[] | null;
  /** The two blended per group, then nudged by measured audio. Selection reads this. */
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

export interface InterpretInput extends SignalInput {
  /** Measured axis positions, used to argue with descriptors that contradict them. */
  measured?: Partial<Record<AxisId, { value: number; confidence: number }>>;
}

/**
 * Reads a song's signals against the descriptor vocabulary.
 *
 * Signals and lyrics are embedded separately and blended per group, so lyrics
 * shape themes strongly, mood and character a little, and texture not at all.
 * Measured audio then nudges whatever disagrees with it.
 */
export async function interpretSignals(input: InterpretInput): Promise<Interpretation> {
  const signalText = buildSignalText(input);
  const lyricText = condenseLyrics(input.lyrics);

  const [signalVector, lyricVector, descriptorVectors] = await Promise.all([
    embeddingService.embed(signalText),
    lyricText ? embeddingService.embed(lyricText) : Promise.resolve(null),
    getDescriptorVectors(),
  ]);

  const signalRanked = rankDescriptors(signalVector, descriptorVectors);
  const lyricRanked = lyricVector ? rankDescriptors(lyricVector, descriptorVectors) : null;
  const ranked = nudgeByAudio(blendRankings(signalRanked, lyricRanked), input.measured ?? {});
  const selection = selectDescriptors(ranked);

  return {
    signalText,
    lyricChars: lyricText.length,
    signalRanked,
    lyricRanked,
    ranked,
    ...selection,
  };
}
