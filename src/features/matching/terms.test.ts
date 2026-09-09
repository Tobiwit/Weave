import { describe, expect, it } from 'vitest';
import type { Playlist, SongProfile } from '../../types';
import {
  eraOf,
  moodEmbeddingText,
  playlistStyleText,
  profileEmbeddingText,
  profileFacets,
  styleEmbeddingText,
  themeEmbeddingText,
} from './terms';

function profile(patch: Partial<SongProfile> = {}): SongProfile {
  return {
    songId: 'sng_1',
    genres: ['disco', 'dance-pop'],
    communityTags: ['dance', 'catchy'],
    themes: ['Nightlife', 'Confidence'],
    vibes: ['Glossy', 'Dancefloor'],
    mood: 'Confident',
    measuredFields: [],
    manualTags: [],
    removedTags: [],
    sources: [],
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe('profileFacets', () => {
  it('drops removed descriptors from every facet', () => {
    const facets = profileFacets(
      profile({ removedTags: ['Glossy', 'disco', 'Nightlife', 'dance'] }),
    );
    expect(facets.vibes).toEqual(['Dancefloor']);
    expect(facets.genres).toEqual(['dance-pop']);
    expect(facets.themes).toEqual(['Confidence']);
    expect(facets.communityTags).toEqual(['catchy']);
  });

  it('is case insensitive about removals', () => {
    expect(profileFacets(profile({ removedTags: ['glossy'] })).vibes).toEqual([
      'Dancefloor',
    ]);
  });

  it('returns manual additions to the facet they were added from', () => {
    const facets = profileFacets(
      profile({ manualTags: ['vibe:Bratty', 'theme:Jealousy', 'genre:hyperpop'] }),
    );
    expect(facets.vibes).toContain('Bratty');
    expect(facets.themes).toContain('Jealousy');
    expect(facets.genres).toContain('hyperpop');
  });

  it('puts an unprefixed manual tag on the character line', () => {
    // Written before manual tags carried a facet, so it has to land somewhere.
    expect(profileFacets(profile({ manualTags: ['witchy'] })).vibes).toContain(
      'witchy',
    );
  });

  it('does not duplicate a manual tag that was already inferred', () => {
    const facets = profileFacets(profile({ manualTags: ['vibe:Glossy'] }));
    expect(facets.vibes.filter((v) => v.toLowerCase() === 'glossy')).toHaveLength(1);
  });
});

describe('profileEmbeddingText', () => {
  it('reflects an edit, so a correction reaches matching', () => {
    const before = profileEmbeddingText(profile());
    const after = profileEmbeddingText(
      profile({ removedTags: ['Glossy'], manualTags: ['vibe:Bratty'] }),
    );
    expect(after).not.toBe(before);
    expect(after).toContain('Bratty');
    expect(after).not.toContain('Glossy');
  });

  it('keeps the facet labels a playlist text mirrors', () => {
    const text = profileEmbeddingText(profile());
    for (const label of ['Mood:', 'Style:', 'Character:', 'Themes:', 'Described as:']) {
      expect(text).toContain(label);
    }
  });

  it('omits facets that are empty rather than leaving a dangling label', () => {
    const text = profileEmbeddingText(
      profile({ themes: [], communityTags: [], mood: undefined }),
    );
    expect(text).not.toContain('Themes:');
    expect(text).not.toContain('Described as:');
    expect(text).not.toContain('Mood:');
  });

  it('is stable for the same input', () => {
    expect(profileEmbeddingText(profile())).toBe(profileEmbeddingText(profile()));
  });
});

describe('facet texts', () => {
  it('puts artist and era into style, and nothing else', () => {
    const text = styleEmbeddingText(profile(), {
      id: 'sng_1',
      title: 'x',
      artist: 'Sophie Ellis-Bextor',
      year: 2001,
    });
    expect(text).toContain('Sophie Ellis-Bextor');
    expect(text).toContain('2000s');
    expect(text).toContain('disco');
    expect(text).not.toContain('Confident');
  });

  it('keeps mood and character together and apart from themes', () => {
    expect(moodEmbeddingText(profile())).toContain('Confident');
    expect(moodEmbeddingText(profile())).toContain('Glossy');
    expect(moodEmbeddingText(profile())).not.toContain('Nightlife');
    expect(themeEmbeddingText(profile())).toContain('Nightlife');
  });

  it('gives an empty string when a facet has nothing in it', () => {
    expect(themeEmbeddingText(profile({ themes: [] }))).toBe('');
    expect(moodEmbeddingText(profile({ mood: undefined, vibes: [] }))).toBe('');
  });

  it('phrases a playlist facet the way the song side is phrased', () => {
    const playlist = { keywords: ['weird', 'camp'] } as Playlist;
    expect(playlistStyleText(playlist).startsWith('Style:')).toBe(true);
  });
});

describe('eraOf', () => {
  it('rounds a year down to its decade', () => {
    expect(eraOf(2001)).toBe('2000s');
    expect(eraOf(1977)).toBe('1970s');
    expect(eraOf(2020)).toBe('2020s');
  });

  it('refuses values that cannot be a release year', () => {
    expect(eraOf(undefined)).toBeUndefined();
    expect(eraOf(0)).toBeUndefined();
    expect(eraOf(Number.NaN)).toBeUndefined();
    expect(eraOf(3000)).toBeUndefined();
  });
});
