import { MATCHING_CONFIG } from '../../config/matching';
import type { Playlist, SongProfile } from '../../types';
import {
  calculateLeaveOneOutCentroid,
  cosineSimilarity,
  normalizeSimilarity,
  semanticBreadth,
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

/** The descriptors that recur across a playlist's songs. */
export function coreQualities(profiles: SongProfile[], limit = 6): string[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const profile of profiles) {
    const terms = [
      ...(profile.mood ? [profile.mood] : []),
      ...profile.vibes,
      ...profile.themes,
    ];
    for (const term of terms) {
      const key = term.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: term, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
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
