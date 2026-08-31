import { MATCHING_CONFIG } from '../../config/matching';
import { cosineSimilarity } from './vector';

/** Resolves a descriptor term to its embedding, when one has been computed. */
export type TermVectorResolver = (term: string) => number[] | undefined;

export interface ExplanationLimits {
  maxOverlapReasons: number;
  maxDifferenceReasons: number;
}

export interface Explanation {
  reasons: string[];
  differences: string[];
}

const STRONG = 0.55;
const WEAK = 0.3;

function tokens(term: string): string[] {
  return term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Fallback when no embeddings are available: token overlap, Jaccard style. */
function lexicalSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

function termSimilarity(a: string, b: string, resolve?: TermVectorResolver): number {
  if (resolve) {
    const va = resolve(a);
    const vb = resolve(b);
    if (va && vb) return cosineSimilarity(va, vb);
  }
  return lexicalSimilarity(a, b);
}

function bestMatch(
  term: string,
  candidates: string[],
  resolve?: TermVectorResolver,
): number {
  let best = 0;
  for (const candidate of candidates) {
    const value = termSimilarity(term, candidate, resolve);
    if (value > best) best = value;
  }
  return best;
}

function dedupe(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term.trim());
  }
  return out;
}

/**
 * Builds the lightweight human explanation for a match.
 *
 * `reasons` are the descriptors the song and the playlist genuinely share.
 * `differences` are descriptors on either side with no counterpart.
 */
export function explainMatch(
  songTerms: string[],
  playlistTerms: string[],
  resolve?: TermVectorResolver,
  config: ExplanationLimits = MATCHING_CONFIG,
): Explanation {
  const song = dedupe(songTerms);
  const playlist = dedupe(playlistTerms);

  if (song.length === 0 || playlist.length === 0) {
    return { reasons: [], differences: [] };
  }

  const scoredSong = song
    .map((term) => ({ term, score: bestMatch(term, playlist, resolve) }))
    .sort((a, b) => b.score - a.score);

  const reasons = scoredSong
    .filter((entry) => entry.score >= STRONG)
    .slice(0, config.maxOverlapReasons)
    .map((entry) => entry.term);

  const songOutliers = scoredSong
    .filter((entry) => entry.score < WEAK)
    .slice(0, config.maxDifferenceReasons)
    .map((entry) => entry.term);

  const playlistOutliers = playlist
    .map((term) => ({ term, score: bestMatch(term, song, resolve) }))
    .filter((entry) => entry.score < WEAK)
    .sort((a, b) => a.score - b.score)
    .slice(0, config.maxDifferenceReasons)
    .map((entry) => entry.term);

  return {
    reasons,
    differences: dedupe([...songOutliers, ...playlistOutliers]).slice(
      0,
      config.maxDifferenceReasons + 1,
    ),
  };
}
