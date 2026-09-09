import { MATCHING_CONFIG } from '../../config/matching';
import type { Playlist, SongProfile } from '../../types';
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
  /** Playlists the corpus spans. Zero when it was built from songs alone. */
  playlistCount: number;
  /**
   * Lowercased term to the number of playlists carrying it, counting community
   * tags, descriptors and the words the playlist was written with alike.
   */
  playlistFrequency: Map<string, number>;
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Every word a song contributes: what listeners call it and what we read in it. */
export function songTerms(profile: SongProfile): string[] {
  const facets = profileFacets(profile);
  return [
    ...facets.communityTags,
    ...facets.genres,
    ...facets.vibes,
    ...facets.themes,
    ...(facets.mood ? [facets.mood] : []),
  ];
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

  return {
    documentCount,
    documentFrequency,
    playlistCount: 0,
    playlistFrequency: new Map(),
  };
}

/**
 * The corpus with the playlist dimension filled in.
 *
 * Counting songs alone answers the wrong question. Someone who listens mostly
 * to indie pop has indie pop on most of their songs and on most of their
 * playlists, and it tells you nothing about which playlist anything belongs
 * to. A word that appears on one playlist out of nine tells you a great deal,
 * even if that playlist is large enough that the word is common song by song.
 *
 * So the unit is the playlist, and every kind of word counts: community tags,
 * the descriptors we read, and the words the playlist was written with. That is
 * what makes "rock" a strong signal in a library of otherwise indie pop, and
 * what stops "feminine" from being a defining quality of half of them.
 */
export function buildLibraryCorpus(
  profiles: SongProfile[],
  playlists: Playlist[],
): TagCorpus {
  const corpus = buildTagCorpus(profiles);
  const byId = new Map(profiles.map((profile) => [profile.songId, profile]));

  const playlistFrequency = new Map<string, number>();
  let playlistCount = 0;

  for (const playlist of playlists) {
    const terms = new Set<string>();
    for (const keyword of playlist.keywords) {
      const key = normalizeTag(keyword);
      if (key) terms.add(key);
    }
    for (const songId of playlist.songIds) {
      const profile = byId.get(songId);
      if (!profile) continue;
      for (const term of songTerms(profile)) {
        const key = normalizeTag(term);
        if (key) terms.add(key);
      }
    }

    if (terms.size === 0) continue;
    playlistCount += 1;
    for (const term of terms) {
      playlistFrequency.set(term, (playlistFrequency.get(term) ?? 0) + 1);
    }
  }

  return { ...corpus, playlistCount, playlistFrequency };
}

function clampedIdf(
  frequency: number,
  total: number,
  config = MATCHING_CONFIG.tagRarity,
): number {
  const idf = Math.log((total + 1) / (frequency + 1)) + 1;
  return Math.min(config.maxWeight, Math.max(config.minWeight, idf));
}

/**
 * How much a word narrows down which playlist something belongs to.
 *
 * Measured across playlists when there are enough of them to mean anything.
 * Below that the library cannot tell a distinctive word from a coincidence, so
 * it falls back to counting songs, and below that it gives up and treats every
 * word as equal rather than inventing a distinction.
 */
export function discriminationWeight(
  term: string,
  corpus: TagCorpus,
  config = MATCHING_CONFIG.tagRarity,
): number {
  const key = normalizeTag(term);

  if (corpus.playlistCount >= config.minPlaylists) {
    return clampedIdf(corpus.playlistFrequency.get(key) ?? 0, corpus.playlistCount, config);
  }
  if (corpus.documentCount < config.minCorpusSize) return 1;
  return clampedIdf(corpus.documentFrequency.get(key) ?? 0, corpus.documentCount, config);
}

/**
 * The weight a community tag carries when matching, clamped to a usable band.
 *
 * The same question `discriminationWeight` answers, because matching is
 * choosing between playlists. A tag the corpus has never seen is treated as
 * merely rare rather than as infinitely informative, which is what the ceiling
 * is for.
 */
export function tagWeight(
  tag: string,
  corpus: TagCorpus,
  config = MATCHING_CONFIG.tagRarity,
): number {
  return discriminationWeight(tag, corpus, config);
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
