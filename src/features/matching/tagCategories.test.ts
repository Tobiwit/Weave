import { describe, expect, it } from 'vitest';
import { categorizeTag, categoryWeightsFor, tagCategoryWeigher } from './tagCategories';
import { tagSimilarity } from './tagRarity';

describe('categorizeTag', () => {
  it.each([
    ['dream pop', 'genre'],
    ['uk garage', 'genre'],
    ['latin pop', 'genre'],
    ['cuban', 'place'],
    ['british', 'place'],
    ['80s', 'era'],
    ['2010s', 'era'],
    ['female vocalists', 'vocals'],
    ['piano', 'instrument'],
    ['melancholic', 'character'],
    ['ethereal', 'character'],
    ['gertrude', 'other'],
  ])('%s is %s', (tag, category) => {
    expect(categorizeTag(tag)).toBe(category);
  });
});

describe('categoryWeightsFor', () => {
  it('restores a category the playlist itself names', () => {
    expect(categoryWeightsFor([]).place).toBeLessThan(1);
    expect(categoryWeightsFor(['cuban', 'warm']).place).toBe(1);
  });
});

describe('tagSimilarity with categories', () => {
  it('stops a shared place tag from carrying a match', () => {
    const song = new Map([['cuban', 2], ['dream pop', 1]]);
    const playlist = new Map([['cuban', 2], ['techno', 1]]);
    const weigh = tagCategoryWeigher(categoryWeightsFor([]));
    expect(tagSimilarity(song, playlist, weigh)).toBeLessThan(tagSimilarity(song, playlist));
  });
});
