import { MATCHING_CONFIG } from '../../config/matching';
import type { SongProfile } from '../../types';
import { profileFacets } from './terms';

/**
 * Rarity weighting for community tags, used only when matching.
 *
 * Last.fm tags are wildly uneven. "pop" and "female vocalists" land on a large
 * share of a library and say almost nothing about what a song is; "shoegaze"
 * or "sea shanty" land on a handful and say a great deal. Counting them
 * equally lets the common ones drown out the informative ones.
 *
 * So each tag is weighted by inverse document frequency over the songs that
 * have actually been read. The weight is clamped at both ends: without a
 * ceiling, a tag that appears on one song in a library of hundreds would
 * outweigh everything else, and a typo or a joke tag would become the strongest
 * signal in the comparison.
 *
 * Nothing here touches extraction, the minimum-use filter, or what is
 * displayed. The tags a person sees are unchanged.
 */

export interface TagCorpus {
  /** Songs the corpus was built from. */
  documentCount: number;
  /** Lowercased tag to the number of songs carrying it. */
  documentFrequency: Map<string, number>;
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Counts how many read songs carry each tag. */
export function buildTagCorpus(profiles: SongProfile[]): TagCorpus {
  const documentFrequency = new Map<string, number>();
  let documentCount = 0;

  for (const profile of profiles) {
    const tags = new Set(profileFacets(profile).communityTags.map(normalizeTag));
    if (tags.size === 0) continue;
    documentCount += 1;
    for (const tag of tags) {
      documentFrequency.set(tag, (documentFrequency.get(tag) ?? 0) + 1);
    }
  }

  return { documentCount, documentFrequency };
}

/**
 * Smoothed inverse document frequency, clamped to a usable band.
 *
 * A tag the corpus has never seen is treated as merely rare rather than as
 * infinitely informative, which is what the ceiling is for.
 */
export function tagWeight(
  tag: string,
  corpus: TagCorpus,
  config = MATCHING_CONFIG.tagRarity,
): number {
  // Too small a corpus cannot tell common from rare, so nothing is up-weighted
  // until there is enough evidence to justify it.
  if (corpus.documentCount < config.minCorpusSize) return 1;

  const frequency = corpus.documentFrequency.get(normalizeTag(tag)) ?? 0;
  const idf = Math.log((corpus.documentCount + 1) / (frequency + 1)) + 1;
  return Math.min(config.maxWeight, Math.max(config.minWeight, idf));
}

/** A tag set as a sparse weighted vector, keyed by the normalised tag. */
export type TagVector = Map<string, number>;

export function songTagVector(tags: string[], corpus: TagCorpus): TagVector {
  const vector: TagVector = new Map();
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (key) vector.set(key, tagWeight(key, corpus));
  }
  return vector;
}

/**
 * A playlist's tags, weighted by rarity and by how much of the playlist
 * carries them.
 *
 * A tag on nine of ten songs describes the playlist; the same tag on one of
 * ten is a detail of that one song. Frequency within the playlist is what
 * separates the two, and it is why this is not just the union of the tags.
 */
export function playlistTagVector(
  profiles: SongProfile[],
  corpus: TagCorpus,
): TagVector {
  const counts = new Map<string, number>();
  let songs = 0;

  for (const profile of profiles) {
    const tags = new Set(profileFacets(profile).communityTags.map(normalizeTag));
    if (tags.size === 0) continue;
    songs += 1;
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  const vector: TagVector = new Map();
  if (songs === 0) return vector;
  for (const [tag, count] of counts) {
    vector.set(tag, tagWeight(tag, corpus) * (count / songs));
  }
  return vector;
}

/**
 * Cosine similarity between two weighted tag sets, in [0, 1].
 *
 * Cosine rather than a plain overlap count so a song with forty tags is not
 * automatically a better match than one with six.
 */
export function tagSimilarity(a: TagVector, b: TagVector): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  // Iterating the smaller side keeps this linear in the shorter tag list.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [tag, weight] of small) {
    const other = large.get(tag);
    if (other) dot += weight * other;
  }
  if (dot === 0) return 0;

  let magA = 0;
  for (const weight of a.values()) magA += weight * weight;
  let magB = 0;
  for (const weight of b.values()) magB += weight * weight;

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : Math.min(1, dot / denominator);
}
