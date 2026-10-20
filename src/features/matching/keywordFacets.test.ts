import { describe, expect, it } from 'vitest';
import { placeKeyword, splitKeywords } from './keywordFacets';

describe('placeKeyword', () => {
  it('sends genres, eras and places to style', () => {
    expect(placeKeyword('hyperpop', null).facet).toBe('style');
    expect(placeKeyword('80s', null).facet).toBe('style');
    expect(placeKeyword('cuban', null).facet).toBe('style');
  });

  it('sends a theme descriptor to themes and a mood descriptor to mood', () => {
    expect(placeKeyword('heartbreak', 'heartbreak').facet).toBe('themes');
    expect(placeKeyword('dreamy', 'dreamy').facet).toBe('moodVibe');
    expect(placeKeyword('witchy', 'witchy').facet).toBe('moodVibe');
  });

  it('marks a word that reads as nothing as unassigned mood', () => {
    expect(placeKeyword('aux on', null)).toEqual({ facet: 'moodVibe', assigned: false });
  });
});

describe('splitKeywords', () => {
  it('keeps each facet to its own words', () => {
    const split = splitKeywords([
      { keyword: 'hyperpop', facet: 'style' },
      { keyword: 'camp', facet: 'moodVibe' },
      { keyword: 'longing', facet: 'themes' },
    ]);
    expect(split).toEqual({ style: ['hyperpop'], moodVibe: ['camp'], themes: ['longing'] });
  });
});
