import { describe, expect, it } from 'vitest';
import { nearestPlaylists, rankPlaylists, semanticBreadth, type PlaylistCandidate } from './rank';

const candidates: PlaylistCandidate[] = [
  { playlistId: 'lipgloss', vector: [1, 0, 0], terms: ['glossy', 'feminine', 'confident'] },
  { playlistId: 'quirky', vector: [0.6, 0.8, 0], terms: ['weird', 'camp', 'playful'] },
  { playlistId: 'moonflower', vector: [0, 0, 1], terms: ['dreamy', 'witchy', 'warm'] },
];

describe('rankPlaylists', () => {
  const songVector = [0.95, 0.31, 0];
  const songTerms = ['glossy', 'confident', 'dreamy'];

  it('orders playlists by similarity, strongest first', () => {
    const ranked = rankPlaylists(songVector, songTerms, candidates);
    expect(ranked.map((match) => match.playlistId)).toEqual([
      'lipgloss',
      'quirky',
      'moonflower',
    ]);
  });

  it('returns a normalised score alongside the raw similarity', () => {
    const [best] = rankPlaylists(songVector, songTerms, candidates);
    expect(best.similarity).toBeGreaterThan(0.9);
    expect(best.score).toBeGreaterThan(80);
    expect(best.score).toBeLessThanOrEqual(100);
  });

  it('explains overlap using the descriptors the two actually share', () => {
    const [best] = rankPlaylists(songVector, songTerms, candidates);
    expect(best.reasons).toContain('glossy');
    expect(best.reasons).toContain('confident');
    expect(best.reasons).not.toContain('dreamy');
  });

  it('surfaces descriptors that do not line up', () => {
    const [best] = rankPlaylists(songVector, songTerms, candidates);
    expect(best.differences).toContain('dreamy');
  });

  it('ranks every candidate exactly once', () => {
    const ranked = rankPlaylists(songVector, songTerms, candidates);
    expect(ranked).toHaveLength(candidates.length);
    expect(new Set(ranked.map((m) => m.playlistId)).size).toBe(candidates.length);
  });

  it('breaks ties deterministically', () => {
    const tied: PlaylistCandidate[] = [
      { playlistId: 'b', vector: [1, 0], terms: [] },
      { playlistId: 'a', vector: [1, 0], terms: [] },
    ];
    expect(rankPlaylists([1, 0], [], tied).map((m) => m.playlistId)).toEqual(['a', 'b']);
  });

  it('returns nothing when the song has no embedding', () => {
    const ranked = rankPlaylists([], [], candidates);
    expect(ranked.every((match) => match.similarity === 0)).toBe(true);
  });
});

describe('nearestPlaylists', () => {
  it('finds the closest other playlists and never itself', () => {
    const nearest = nearestPlaylists(candidates[0], candidates, 2);
    expect(nearest.map((r) => r.playlistId)).toEqual(['quirky', 'moonflower']);
    expect(nearest.some((r) => r.playlistId === 'lipgloss')).toBe(false);
  });

  it('respects the requested limit', () => {
    expect(nearestPlaylists(candidates[0], candidates, 1)).toHaveLength(1);
  });
});

describe('semanticBreadth', () => {
  it('reports near zero when every song sits on the centroid', () => {
    const vectors = [
      [1, 0],
      [1, 0],
    ];
    expect(semanticBreadth(vectors, [1, 0])).toBeCloseTo(0, 10);
  });

  it('grows as songs spread away from the centroid', () => {
    const tight = semanticBreadth([[1, 0.05], [1, -0.05]], [1, 0]);
    const loose = semanticBreadth([[1, 0.9], [1, -0.9]], [1, 0]);
    expect(loose).toBeGreaterThan(tight);
  });

  it('returns 0 when there is not enough to measure', () => {
    expect(semanticBreadth([[1, 0]], [1, 0])).toBe(0);
    expect(semanticBreadth([[1, 0], [0, 1]], [])).toBe(0);
  });
});
