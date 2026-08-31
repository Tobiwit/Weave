import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import { calculatePlaylistVector } from './playlistVector';

describe('calculatePlaylistVector', () => {
  it('uses the keyword embedding alone when there are no example songs', () => {
    const result = calculatePlaylistVector({ keywordEmbedding: [1, 0, 0] });
    expect(result.vector).toEqual([1, 0, 0]);
    expect(result.usedExamples).toBe(false);
    expect(result.centroidEmbedding).toEqual([]);
  });

  it('blends keywords and the song centroid by the configured weights', () => {
    const result = calculatePlaylistVector({
      keywordEmbedding: [1, 0],
      songEmbeddings: [
        [0, 1],
        [0, 3],
      ],
    });

    const { keywordWeight, centroidWeight } = MATCHING_CONFIG;
    expect(result.centroidEmbedding).toEqual([0, 2]);
    expect(result.vector[0]).toBeCloseTo(keywordWeight, 10);
    expect(result.vector[1]).toBeCloseTo(centroidWeight * 2, 10);
    expect(result.usedExamples).toBe(true);
  });

  it('weights example songs more heavily than words by default', () => {
    expect(MATCHING_CONFIG.centroidWeight).toBeGreaterThan(
      MATCHING_CONFIG.keywordWeight,
    );
  });

  it('falls back to the centroid when there is no keyword embedding', () => {
    const result = calculatePlaylistVector({
      songEmbeddings: [
        [2, 0],
        [4, 0],
      ],
    });
    expect(result.vector).toEqual([3, 0]);
    expect(result.usedExamples).toBe(true);
  });

  it('ignores empty song vectors when computing the centroid', () => {
    const result = calculatePlaylistVector({
      keywordEmbedding: [0, 1],
      songEmbeddings: [[], [2, 0]],
    });
    expect(result.centroidEmbedding).toEqual([2, 0]);
  });

  it('returns an empty vector when a playlist has nothing at all', () => {
    expect(calculatePlaylistVector({}).vector).toEqual([]);
  });
});
