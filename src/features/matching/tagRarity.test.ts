import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import type { Playlist, SongProfile } from '../../types';
import {
  buildLibraryCorpus,
  buildTagCorpus,
  discriminationWeight,
  playlistTagVector,
  songTagVector,
  tagSimilarity,
  tagWeight,
} from './tagRarity';

function profile(songId: string, communityTags: string[]): SongProfile {
  return {
    songId,
    genres: [],
    communityTags,
    themes: [],
    vibes: [],
    measuredFields: [],
    manualTags: [],
    removedTags: [],
    sources: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** "pop" is everywhere; "shoegaze" is on two songs; "sea shanty" on one. */
function library(): SongProfile[] {
  const common = Array.from({ length: 18 }, (_, i) =>
    profile(`common-${i}`, ['pop', 'female vocalists']),
  );
  return [
    ...common,
    profile('a', ['pop', 'shoegaze']),
    profile('b', ['pop', 'shoegaze']),
    profile('c', ['pop', 'sea shanty']),
  ];
}

describe('buildTagCorpus', () => {
  it('counts songs per tag, not occurrences', () => {
    const corpus = buildTagCorpus([
      profile('a', ['pop', 'pop', 'POP']),
      profile('b', ['pop']),
    ]);
    expect(corpus.documentCount).toBe(2);
    expect(corpus.documentFrequency.get('pop')).toBe(2);
  });

  it('ignores songs with no tags', () => {
    const corpus = buildTagCorpus([profile('a', ['pop']), profile('b', [])]);
    expect(corpus.documentCount).toBe(1);
  });
});

describe('tagWeight', () => {
  it('gives a rare tag more weight than a ubiquitous one', () => {
    const corpus = buildTagCorpus(library());
    expect(tagWeight('shoegaze', corpus)).toBeGreaterThan(tagWeight('pop', corpus));
  });

  it('never exceeds the configured bounds', () => {
    const corpus = buildTagCorpus(library());
    const { minWeight, maxWeight } = MATCHING_CONFIG.tagRarity;
    for (const tag of ['pop', 'shoegaze', 'sea shanty', 'never seen before']) {
      const weight = tagWeight(tag, corpus);
      expect(weight).toBeGreaterThanOrEqual(minWeight);
      expect(weight).toBeLessThanOrEqual(maxWeight);
    }
  });

  it('caps a one-off tag rather than letting it dominate', () => {
    // Without a ceiling, a tag on 1 of 10000 songs would swamp everything.
    const huge = buildTagCorpus(
      Array.from({ length: 10000 }, (_, i) => profile(`s${i}`, ['pop'])).concat(
        profile('odd', ['typoo']),
      ),
    );
    expect(tagWeight('typoo', huge)).toBe(MATCHING_CONFIG.tagRarity.maxWeight);
  });

  it('stays neutral until the corpus is big enough to judge rarity', () => {
    const tiny = buildTagCorpus([profile('a', ['pop']), profile('b', ['shoegaze'])]);
    expect(tagWeight('shoegaze', tiny)).toBe(1);
    expect(tagWeight('pop', tiny)).toBe(1);
  });

  it('is case and whitespace insensitive', () => {
    const corpus = buildTagCorpus(library());
    expect(tagWeight('  ShoeGaze ', corpus)).toBe(tagWeight('shoegaze', corpus));
  });
});

describe('tagSimilarity', () => {
  const corpus = buildTagCorpus(library());

  it('is 1 for identical tag sets', () => {
    const a = songTagVector(['pop', 'shoegaze'], corpus);
    expect(tagSimilarity(a, a)).toBeCloseTo(1, 10);
  });

  it('is 0 when nothing is shared', () => {
    expect(
      tagSimilarity(
        songTagVector(['pop'], corpus),
        songTagVector(['sea shanty'], corpus),
      ),
    ).toBe(0);
  });

  it('rates a shared rare tag above a shared common one', () => {
    const rare = tagSimilarity(
      songTagVector(['shoegaze', 'x'], corpus),
      songTagVector(['shoegaze', 'y'], corpus),
    );
    const common = tagSimilarity(
      songTagVector(['pop', 'x'], corpus),
      songTagVector(['pop', 'y'], corpus),
    );
    expect(rare).toBeGreaterThan(common);
  });

  it('does not reward a song simply for having many tags', () => {
    const focused = songTagVector(['shoegaze'], corpus);
    const target = songTagVector(['shoegaze'], corpus);
    const padded = songTagVector(
      ['shoegaze', 'pop', 'female vocalists', 'sea shanty'],
      corpus,
    );
    expect(tagSimilarity(focused, target)).toBeGreaterThan(
      tagSimilarity(padded, target),
    );
  });

  it('is empty-safe', () => {
    expect(tagSimilarity(new Map(), songTagVector(['pop'], corpus))).toBe(0);
  });
});

describe('playlistTagVector', () => {
  const corpus = buildTagCorpus(library());

  it('weights a tag by how much of the playlist carries it', () => {
    const vector = playlistTagVector(
      [
        profile('a', ['shoegaze']),
        profile('b', ['shoegaze']),
        profile('c', ['sea shanty']),
      ],
      corpus,
    );
    const shoegaze = vector.get('shoegaze') ?? 0;
    const shanty = vector.get('sea shanty') ?? 0;
    // Both are rare in the corpus, but one describes the playlist and the
    // other describes a single song in it.
    expect(shoegaze).toBeGreaterThan(shanty);
  });

  it('is empty for a playlist with no read songs', () => {
    expect(playlistTagVector([], corpus).size).toBe(0);
  });
});

function playlist(id: string, songIds: string[], keywords: string[] = []): Playlist {
  return { id, name: id, keywords, songIds, createdAt: 0, updatedAt: 0 };
}

describe('buildLibraryCorpus', () => {
  it('counts playlists carrying a term, not songs', () => {
    const profiles = [
      profile('a', ['indie pop']),
      profile('b', ['indie pop']),
      profile('c', ['rock']),
    ];
    const corpus = buildLibraryCorpus(profiles, [
      playlist('p1', ['a', 'b']),
      playlist('p2', ['c']),
    ]);
    expect(corpus.playlistCount).toBe(2);
    expect(corpus.playlistFrequency.get('indie pop')).toBe(1);
    expect(corpus.playlistFrequency.get('rock')).toBe(1);
  });

  it('counts the words a playlist was written with too', () => {
    const corpus = buildLibraryCorpus([], [playlist('p1', [], ['dreamy'])]);
    expect(corpus.playlistFrequency.get('dreamy')).toBe(1);
  });

  it('counts descriptors, not only community tags', () => {
    const withVibes: SongProfile = { ...profile('a', []), vibes: ['Glossy'] };
    const corpus = buildLibraryCorpus([withVibes], [playlist('p1', ['a'])]);
    expect(corpus.playlistFrequency.get('glossy')).toBe(1);
  });
});

describe('discriminationWeight', () => {
  /** Nine playlists: eight indie pop, one rock. */
  function library() {
    const profiles = [
      ...Array.from({ length: 8 }, (_, i) => profile(`ip${i}`, ['indie pop'])),
      profile('r', ['rock']),
    ];
    const playlists = [
      ...Array.from({ length: 8 }, (_, i) => playlist(`p${i}`, [`ip${i}`])),
      playlist('prock', ['r']),
    ];
    return buildLibraryCorpus(profiles, playlists);
  }

  it('makes the odd-one-out word the strong selector', () => {
    const corpus = library();
    // This is the case exactly: listening mostly to indie pop should make
    // "indie pop" nearly worthless for telling playlists apart, while the one
    // rock playlist makes "rock" highly informative.
    expect(discriminationWeight('rock', corpus)).toBeGreaterThan(
      discriminationWeight('indie pop', corpus),
    );
  });

  it('falls back to counting songs when there are too few playlists', () => {
    const profiles = Array.from({ length: 14 }, (_, i) =>
      profile(`s${i}`, i === 0 ? ['rare'] : ['common']),
    );
    const corpus = buildLibraryCorpus(profiles, [playlist('p1', ['s0'])]);
    expect(corpus.playlistCount).toBeLessThan(4);
    expect(discriminationWeight('rare', corpus)).toBeGreaterThan(
      discriminationWeight('common', corpus),
    );
  });

  it('treats every word as equal when there is nothing to compare', () => {
    const corpus = buildLibraryCorpus([profile('a', ['x'])], []);
    expect(discriminationWeight('x', corpus)).toBe(1);
    expect(discriminationWeight('anything', corpus)).toBe(1);
  });
});
