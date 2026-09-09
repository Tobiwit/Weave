import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import type { SongProfile } from '../../types';
import {
  buildTagCorpus,
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
