import { MATCHING_CONFIG } from '../../config/matching';
import type { Playlist, SongProfile } from '../../types';
import {
  calculateLeaveOneOutCentroid,
  cosineSimilarity,
  discriminationWeight,
  normalizeSimilarity,
  profileFacets,
  semanticBreadth,
  type TagCorpus,
} from '../matching';

export interface DefiningSong {
  songId: string;
  score: number;
}

/**
 * Ranks a playlist's own songs by how representative they are.
 *
 * Each song is compared against a centroid built without it, so a song never
 * inflates the target it is measured against. This is the same utility the
 * future Playlist Audit will use to split Core, Edge and Outliers.
 */
export function rankDefiningSongs(profiles: SongProfile[]): DefiningSong[] {
  const usable = profiles.filter((p) => p.semanticEmbedding?.length);
  if (usable.length === 0) return [];
  if (usable.length === 1) {
    return [{ songId: usable[0].songId, score: 100 }];
  }

  const vectors = usable.map((p) => p.semanticEmbedding as number[]);

  return usable
    .map((profile, index) => {
      const others = calculateLeaveOneOutCentroid(vectors, index);
      const similarity = cosineSimilarity(vectors[index], others);
      return {
        songId: profile.songId,
        score: normalizeSimilarity(
          similarity,
          MATCHING_CONFIG.withinPlaylistNormalization,
        ),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface PlaylistBreadth {
  value: number;
  label: string;
}

/** Breadth as language, not as a statistic. */
export function describeBreadth(
  profiles: SongProfile[],
  centroidEmbedding: number[] | undefined,
): PlaylistBreadth | null {
  const vectors = profiles
    .map((p) => p.semanticEmbedding)
    .filter((v): v is number[] => Array.isArray(v) && v.length > 0);

  if (vectors.length < 2 || !centroidEmbedding?.length) return null;

  const value = semanticBreadth(vectors, centroidEmbedding);
  if (value < 0.18) return { value, label: 'Tightly focused' };
  if (value < 0.32) return { value, label: 'Focused' };
  if (value < 0.46) return { value, label: 'Broad' };
  return { value, label: 'Very broad' };
}

/**
 * The descriptors that make a playlist itself.
 *
 * Not simply the ones that recur most: a word can be on every song here and on
 * every song everywhere else too, and then it describes your taste rather than
 * this playlist. "Feminine" turning up as a core quality of half your
 * playlists is that failure exactly.
 *
 * So frequency inside the playlist is weighed against how many playlists carry
 * the word at all. A word common here and rare elsewhere rises; a word common
 * everywhere falls, however often it appears. Without a corpus there is nothing
 * to compare against and this falls back to plain frequency.
 */
export function coreQualities(
  profiles: SongProfile[],
  corpus?: TagCorpus,
  limit = 6,
): string[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const profile of profiles) {
    const facets = profileFacets(profile);
    const terms = [
      ...(facets.mood ? [facets.mood] : []),
      ...facets.vibes,
      ...facets.themes,
    ];
    // A word repeated on one song still only counts once for that song.
    for (const term of new Set(terms.map((t) => t.toLowerCase()))) {
      const label = terms.find((t) => t.toLowerCase() === term) ?? term;
      const entry = counts.get(term);
      if (entry) entry.count += 1;
      else counts.set(term, { label, count: 1 });
    }
  }

  const songs = Math.max(1, profiles.length);

  return [...counts.entries()]
    .map(([key, { label, count }]) => ({
      label,
      score: corpus
        ? (count / songs) * discriminationWeight(key, corpus)
        : count,
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((entry) => entry.label);
}

/** Descriptors shared by two playlists, and what pulls each way. */
export function comparePlaylists(
  a: Playlist,
  b: Playlist,
): { shared: string[]; towardA: string[]; towardB: string[] } {
  const setA = new Map(a.keywords.map((k) => [k.toLowerCase(), k]));
  const setB = new Map(b.keywords.map((k) => [k.toLowerCase(), k]));

  const shared: string[] = [];
  for (const [key, label] of setA) {
    if (setB.has(key)) shared.push(label);
  }

  return {
    shared,
    towardA: a.keywords.filter((k) => !setB.has(k.toLowerCase())),
    towardB: b.keywords.filter((k) => !setA.has(k.toLowerCase())),
  };
}
