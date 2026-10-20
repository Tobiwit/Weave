import { DESCRIPTORS } from '../../data/descriptors';
import { categorizeTag } from './tagCategories';

/**
 * Which part of a match a playlist keyword belongs to.
 *
 * A playlist's keywords arrive as one list: "weird, camp, playful, hyperpop"
 * mixes a style with three feelings. Phrasing the whole list as "Style: …"
 * and again as "Themes: …" made every facet of the playlist say the same
 * thing in different wrappers, so a playlist about a feeling also claimed to
 * be a style of that feeling, and a song was compared against words that were
 * never about that facet.
 *
 * Each keyword now goes to one facet. Genres, eras, places, instruments and
 * vocals are style. A keyword that reads as a theme descriptor is a theme. One
 * that reads as a mood, texture, energy or vibe descriptor is mood. A keyword
 * that reads as nothing ("aux on", "good mood") goes to mood too, since that
 * is the general-purpose line, and is marked as unassigned so it can be seen.
 */
export type KeywordFacet = 'style' | 'moodVibe' | 'themes';

const STYLE_CATEGORIES = new Set(['genre', 'era', 'place', 'instrument', 'vocals']);

export interface KeywordPlacement {
  facet: KeywordFacet;
  /** False when nothing about the word said where it belongs. */
  assigned: boolean;
}

export function placeKeyword(keyword: string, descriptorId: string | null): KeywordPlacement {
  const category = categorizeTag(keyword);
  if (STYLE_CATEGORIES.has(category)) return { facet: 'style', assigned: true };
  const group = descriptorId ? DESCRIPTORS.find((d) => d.id === descriptorId)?.group : undefined;
  if (group === 'theme') return { facet: 'themes', assigned: true };
  // A listener's mood word ("fun", "chill") is a feeling even when no
  // descriptor sits close enough to borrow a position from.
  if (group || category === 'character') return { facet: 'moodVibe', assigned: true };
  return { facet: 'moodVibe', assigned: false };
}

/** The keywords of each facet, in the order they were written. */
export function splitKeywords(
  placements: { keyword: string; facet: KeywordFacet }[],
): Record<KeywordFacet, string[]> {
  const out: Record<KeywordFacet, string[]> = { style: [], moodVibe: [], themes: [] };
  for (const { keyword, facet } of placements) out[facet].push(keyword);
  return out;
}
