import { MATCHING_CONFIG } from '../../config/matching';
import { DESCRIPTOR_AXES } from '../../data/descriptorAxes';
import { DESCRIPTORS } from '../../data/descriptors';
import type { Descriptor, DescriptorGroup, Song } from '../../types';
import { cosineSimilarity } from '../matching/vector';
import type { AxisId } from '../song/axes';

/**
 * Pure descriptor selection.
 *
 * Kept free of services and storage so the interpretation rules can be tested
 * directly against known vectors.
 */

export interface ScoredDescriptor {
  descriptor: Descriptor;
  score: number;
  /** Set when measured audio ruled this descriptor out. */
  vetoed?: boolean;
}

export interface SignalInput {
  song: Song;
  genres: string[];
  communityTags: string[];
  lyrics: string | null;
}

/**
 * Builds the text a song's signals are embedded from: what it is called, who
 * made it, and what listeners call it.
 *
 * Lyrics are deliberately not in here. They are embedded on their own and
 * blended in per descriptor group, so what a song is about cannot quietly
 * decide how it sounds. See `blendRankings`.
 */
export function buildSignalText(input: Omit<SignalInput, 'lyrics'>): string {
  const parts: string[] = [`${input.song.title} by ${input.song.artist}.`];
  if (input.song.year) parts.push(`Released ${input.song.year}.`);
  if (input.genres.length) parts.push(`Genre: ${input.genres.join(', ')}.`);
  if (input.communityTags.length) {
    parts.push(
      `Listeners describe it as: ${input.communityTags.slice(0, 12).join(', ')}.`,
    );
  }
  return parts.join(' ');
}

/**
 * Lyrics cut down to the part that gets embedded.
 *
 * Trimmed hard: we want the semantic gist for comparison, not to hold or
 * reproduce a full copyrighted work.
 */
export function condenseLyrics(lyrics: string | null): string {
  if (!lyrics) return '';
  return lyrics
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

/**
 * Combines the signal ranking with the lyric ranking, group by group.
 *
 * Each group takes its own share from the lyrics: themes mostly, mood and
 * character a little, texture and energy not at all. Without lyrics the signal
 * ranking stands alone rather than being diluted by a missing half.
 */
export function blendRankings(
  signal: ScoredDescriptor[],
  lyrics: ScoredDescriptor[] | null,
  shares: Record<DescriptorGroup, number> = MATCHING_CONFIG.descriptors.lyricShare,
): ScoredDescriptor[] {
  if (!lyrics?.length) return signal;
  const lyricScore = new Map(lyrics.map((entry) => [entry.descriptor.id, entry.score]));
  return signal
    .map((entry) => {
      const share = shares[entry.descriptor.group] ?? 0;
      const fromLyrics = lyricScore.get(entry.descriptor.id);
      if (share === 0 || fromLyrics === undefined) return entry;
      return {
        descriptor: entry.descriptor,
        score: entry.score * (1 - share) + fromLyrics * share,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Groups whose descriptors measured audio is allowed to argue with. */
const AUDIO_GROUPS = new Set<DescriptorGroup>(['mood', 'texture', 'vibe', 'energy']);

/**
 * Moves descriptors towards or away from what the audio measured, and drops
 * the ones it plainly contradicts.
 *
 * A descriptor carries an expected position on the scales. Where measured
 * values exist, its agreement with them runs from -1 (opposite on every axis
 * measured) to 1 (exactly there), and its score moves by that times the nudge,
 * scaled by how confident the measurement is.
 *
 * A nudge alone was too polite: "Bright" led a song with a valence of 0.33 by
 * a tenth of a point, and no nudge small enough to be safe could overturn
 * that. So a descriptor that sits far from a confident measurement on any axis
 * it speaks to is vetoed outright. Words can still decide what the audio
 * cannot hear; they cannot overrule what it did.
 *
 * Themes are left alone: what a song is about is not something audio measures.
 */
export function nudgeByAudio(
  ranked: ScoredDescriptor[],
  measured: Partial<Record<AxisId, { value: number; confidence: number }>>,
  strength: number = MATCHING_CONFIG.descriptors.audioNudge,
  veto = MATCHING_CONFIG.descriptors.audioVeto,
): ScoredDescriptor[] {
  if (Object.keys(measured).length === 0) return ranked;
  return ranked
    .map((entry) => {
      if (!AUDIO_GROUPS.has(entry.descriptor.group)) return entry;
      const signature = DESCRIPTOR_AXES[entry.descriptor.id];
      if (!signature) return entry;

      let weight = 0;
      let agreement = 0;
      let measuredAxes = 0;
      for (const [axis, expected] of Object.entries(signature) as [AxisId, number][]) {
        const reading = measured[axis];
        if (!reading) continue;
        const distance = Math.abs(expected - reading.value);
        if (reading.confidence >= veto.confidence && distance >= veto.distance) {
          return { ...entry, score: entry.score - VETOED, vetoed: true };
        }
        measuredAxes += 1;
        weight += reading.confidence;
        agreement += reading.confidence * (1 - 2 * distance);
      }
      if (weight === 0) return entry;

      const meanConfidence = weight / measuredAxes;
      return {
        descriptor: entry.descriptor,
        score: entry.score + strength * (agreement / weight) * meanConfidence,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** What a veto takes off a score: enough to sink below every floor. */
const VETOED = 1;

/** A ranking as a compact id-to-score record, for storing on a profile. */
export function scoresRecord(ranked: ScoredDescriptor[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of ranked) out[entry.descriptor.id] = Math.round(entry.score * 1000) / 1000;
  return out;
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
