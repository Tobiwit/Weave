import { MATCHING_CONFIG } from '../../config/matching';
import { DESCRIPTORS } from '../../data/descriptors';
import type { Descriptor, DescriptorGroup, Song } from '../../types';
import { cosineSimilarity } from '../matching/vector';

/**
 * Pure descriptor selection.
 *
 * Kept free of services and storage so the interpretation rules can be tested
 * directly against known vectors.
 */

export interface ScoredDescriptor {
  descriptor: Descriptor;
  score: number;
}

export interface SignalInput {
  song: Song;
  genres: string[];
  communityTags: string[];
  lyrics: string | null;
}

/**
 * Builds the text a song is embedded from.
 *
 * Lyrics are trimmed hard: we want the semantic gist for comparison, not to
 * hold or reproduce a full copyrighted work.
 */
export function buildSourceText(input: SignalInput): string {
  const parts: string[] = [`${input.song.title} by ${input.song.artist}.`];
  if (input.song.year) parts.push(`Released ${input.song.year}.`);
  if (input.genres.length) parts.push(`Genre: ${input.genres.join(', ')}.`);
  if (input.communityTags.length) {
    parts.push(
      `Listeners describe it as: ${input.communityTags.slice(0, 12).join(', ')}.`,
    );
  }
  if (input.lyrics) {
    const condensed = input.lyrics
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    if (condensed) parts.push(`Lyrical content: ${condensed}`);
  }
  return parts.join(' ');
}

export function rankDescriptors(
  songVector: number[],
  descriptorVectors: number[][],
  descriptors: Descriptor[] = DESCRIPTORS,
): ScoredDescriptor[] {
  return descriptors
    .map((descriptor, index) => ({
      descriptor,
      score: cosineSimilarity(songVector, descriptorVectors[index] ?? []),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Descriptors that cannot honestly both be true of one song. Showing "Bright"
 * next to "Dark" reads as the system not having an opinion, so the weaker of
 * each pair is dropped before anything is presented.
 */
const OPPOSING_PAIRS: [string, string][] = [
  ['bright', 'dark'],
  ['warm', 'cold'],
  ['minimal', 'maximal'],
  ['raw', 'polished'],
  ['acoustic', 'electronic'],
  ['high-energy', 'low-energy'],
  ['laid-back', 'euphoric-dance'],
];

export function suppressContradictions(
  ranked: ScoredDescriptor[],
): ScoredDescriptor[] {
  const dropped = new Set<string>();
  for (const [a, b] of OPPOSING_PAIRS) {
    const first = ranked.find((entry) => entry.descriptor.id === a);
    const second = ranked.find((entry) => entry.descriptor.id === b);
    if (!first || !second) continue;
    dropped.add(first.score >= second.score ? b : a);
  }
  return ranked.filter((entry) => !dropped.has(entry.descriptor.id));
}

/** The cut-off for a group: an absolute floor, raised relative to its best. */
export function groupFloor(
  ranked: ScoredDescriptor[],
  group: DescriptorGroup,
  minScore: number = MATCHING_CONFIG.descriptors.minSimilarity,
  relative: number = MATCHING_CONFIG.descriptors.relativeFloor,
): number {
  const best = ranked.find((entry) => entry.descriptor.group === group)?.score ?? 0;
  return Math.max(minScore, best * relative);
}

export function topOfGroup(
  ranked: ScoredDescriptor[],
  group: DescriptorGroup,
  limit: number,
  minScore: number = MATCHING_CONFIG.descriptors.minSimilarity,
): ScoredDescriptor[] {
  return ranked
    .filter((entry) => entry.descriptor.group === group && entry.score >= minScore)
    .slice(0, limit);
}

const scoreOf = (ranked: ScoredDescriptor[], id: string) =>
  Math.max(0, ranked.find((entry) => entry.descriptor.id === id)?.score ?? 0);

/**
 * Energy is pace and drive: how much the song moves. Derived from where it
 * sits between the low- and high-energy descriptors. Inferred, and always
 * labelled as such in the interface.
 */
export function inferEnergy(ranked: ScoredDescriptor[]): number {
  const high = scoreOf(ranked, 'high-energy');
  const low = scoreOf(ranked, 'low-energy');
  const mid = scoreOf(ranked, 'mid-energy');
  const total = high + low + mid;
  if (total === 0) return 0.5;
  return Math.min(1, Math.max(0, (high + mid * 0.5) / total));
}

/**
 * Intensity is emotional weight: how much the song asks of you. Deliberately
 * separate from energy, because a hushed song can be overwhelming and a fast
 * one can be weightless. Energy contributes only a little, enough to keep the
 * two from contradicting each other outright.
 */
export function inferIntensity(ranked: ScoredDescriptor[], energy: number): number {
  const intense = [
    'cathartic',
    'angry',
    'euphoric',
    'melodramatic',
    'anthemic',
    'maximal',
    'defiant',
    'triumphant',
  ].reduce((sum, id) => sum + scoreOf(ranked, id), 0);
  const calm = ['calm', 'minimal', 'intimate', 'laid-back', 'atmospheric'].reduce(
    (sum, id) => sum + scoreOf(ranked, id),
    0,
  );
  const total = intense + calm;
  const lean = total === 0 ? 0.5 : intense / total;
  return Math.min(1, Math.max(0, lean * 0.78 + energy * 0.22));
}

export interface DescriptorSelection {
  mood?: string;
  vibes: string[];
  themes: string[];
  energy: number;
  intensity: number;
}

/** Turns a ranking into the handful of descriptors a person actually sees. */
export function selectDescriptors(
  ranked: ScoredDescriptor[],
  limits: Record<DescriptorGroup, number> = MATCHING_CONFIG.descriptors.maxPerGroup,
): DescriptorSelection {
  // Contradictions are removed for display only. Energy is still inferred from
  // the full ranking, where the high and low descriptors must both be visible.
  const shown = suppressContradictions(ranked);

  const mood = topOfGroup(shown, 'mood', limits.mood, groupFloor(shown, 'mood'))[0]
    ?.descriptor.label;
  const themes = topOfGroup(
    shown,
    'theme',
    limits.theme,
    groupFloor(shown, 'theme'),
  ).map((entry) => entry.descriptor.label);
  const vibes = [
    ...topOfGroup(shown, 'vibe', limits.vibe, groupFloor(shown, 'vibe')),
    ...topOfGroup(shown, 'texture', limits.texture, groupFloor(shown, 'texture')),
  ]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.descriptor.label);

  const energy = inferEnergy(ranked);
  return { mood, vibes, themes, energy, intensity: inferIntensity(ranked, energy) };
}
