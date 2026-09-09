import { describe, expect, it } from 'vitest';
import { buildLibraryCorpus } from '../matching';
import type { Playlist, SongProfile } from '../../types';
import {
  comparePlaylists,
  coreQualities,
  describeBreadth,
  rankDefiningSongs,
} from './playlistInsights';

function profile(
  songId: string,
  embedding: number[],
  extra: Partial<SongProfile> = {},
): SongProfile {
  return {
    songId,
    genres: [],
    communityTags: [],
    themes: [],
    vibes: [],
    measuredFields: [],
    manualTags: [],
    removedTags: [],
    sources: [],
    createdAt: 0,
    updatedAt: 0,
    semanticEmbedding: embedding,
    ...extra,
  };
}

function playlist(name: string, keywords: string[]): Playlist {
  return {
    id: name,
    name,
    keywords,
    songIds: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('rankDefiningSongs', () => {
  it('ranks the song closest to the rest of the playlist first', () => {
    const ranked = rankDefiningSongs([
      profile('core-a', [1, 0.02, 0]),
      profile('core-b', [1, 0, 0.02]),
      profile('outlier', [0, 1, 0]),
    ]);
    expect(ranked[0].songId).not.toBe('outlier');
    expect(ranked[ranked.length - 1].songId).toBe('outlier');
  });

  it('never lets a song inflate the centroid it is measured against', () => {
    // Three identical songs plus one outlier. If the outlier counted toward its
    // own target it would score far higher than it deserves.
    const ranked = rankDefiningSongs([
      profile('a', [1, 0]),
      profile('b', [1, 0]),
      profile('c', [1, 0]),
      profile('outlier', [0, 1]),
    ]);
    const outlier = ranked.find((entry) => entry.songId === 'outlier');
    expect(outlier?.score).toBe(0);
  });

  it('treats a lone song as fully representative', () => {
    expect(rankDefiningSongs([profile('only', [1, 0])])).toEqual([
      { songId: 'only', score: 100 },
    ]);
  });

  it('ignores profiles that have not been embedded yet', () => {
    const ranked = rankDefiningSongs([
      profile('has', [1, 0]),
      profile('missing', []),
    ]);
    expect(ranked.map((entry) => entry.songId)).toEqual(['has']);
  });

  it('returns nothing when there is nothing embedded', () => {
    expect(rankDefiningSongs([])).toEqual([]);
  });
});

describe('describeBreadth', () => {
  it('calls a tight cluster focused', () => {
    const result = describeBreadth(
      [profile('a', [1, 0.02]), profile('b', [1, -0.02])],
      [1, 0],
    );
    expect(result?.label).toBe('Tightly focused');
  });

  it('calls a scattered playlist broad', () => {
    const result = describeBreadth(
      [profile('a', [1, 1]), profile('b', [1, -1])],
      [1, 0],
    );
    expect(result?.value).toBeGreaterThan(0.18);
  });

  it('says nothing when there is too little to measure', () => {
    expect(describeBreadth([profile('a', [1, 0])], [1, 0])).toBeNull();
    expect(describeBreadth([profile('a', [1, 0]), profile('b', [0, 1])], undefined))
      .toBeNull();
  });
});

describe('coreQualities', () => {
  it('surfaces the descriptors that recur across the playlist', () => {
    const qualities = coreQualities([
      profile('a', [1], { mood: 'Dreamy', vibes: ['Organic'], themes: ['Longing'] }),
      profile('b', [1], { mood: 'Dreamy', vibes: ['Organic'], themes: ['Freedom'] }),
      profile('c', [1], { mood: 'Calm', vibes: ['Organic'] }),
    ]);
    expect(qualities.slice(0, 2)).toEqual(['Organic', 'Dreamy']);
  });

  it('respects the requested limit', () => {
    const qualities = coreQualities(
      [profile('a', [1], { vibes: ['One', 'Two', 'Three'] })],
      undefined,
      2,
    );
    expect(qualities).toHaveLength(2);
  });

  it('handles a playlist with no analysed songs', () => {
    expect(coreQualities([])).toEqual([]);
  });

  it('demotes a word that every playlist in the library carries', () => {
    // "Feminine" is on every song here, but also on every other playlist, so it
    // describes the listener rather than this playlist. "Bratty" is local.
    const here = [
      profile('a', [1], { vibes: ['Feminine', 'Bratty'] }),
      profile('b', [1], { vibes: ['Feminine', 'Bratty'] }),
      profile('c', [1], { vibes: ['Feminine'] }),
    ];
    const elsewhere = ['p2', 'p3', 'p4', 'p5'].map((id) => ({
      id,
      name: id,
      keywords: ['feminine'],
      songIds: [],
      createdAt: 0,
      updatedAt: 0,
    }));
    const corpus = buildLibraryCorpus(here, [
      { id: 'p1', name: 'p1', keywords: [], songIds: ['a', 'b', 'c'], createdAt: 0, updatedAt: 0 },
      ...elsewhere,
    ]);

    expect(coreQualities(here, corpus)[0]).toBe('Bratty');
    // Without the corpus, sheer frequency puts the useless word first.
    expect(coreQualities(here)[0]).toBe('Feminine');
  });
});

describe('comparePlaylists', () => {
  it('separates shared descriptors from what pulls each way', () => {
    const result = comparePlaylists(
      playlist('lipgloss', ['playful', 'glossy', 'feminine']),
      playlist('quirky', ['playful', 'weird', 'camp']),
    );
    expect(result.shared).toEqual(['playful']);
    expect(result.towardA).toEqual(['glossy', 'feminine']);
    expect(result.towardB).toEqual(['weird', 'camp']);
  });

  it('matches descriptors regardless of case', () => {
    const result = comparePlaylists(
      playlist('a', ['Dreamy']),
      playlist('b', ['dreamy']),
    );
    expect(result.shared).toEqual(['Dreamy']);
    expect(result.towardA).toEqual([]);
  });
});
