import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG } from '../../config/matching';
import {
  playlistSongSimilarity,
  scoreComponents,
  type PlaylistFacets,
  type SongFacets,
} from './components';

const EMPTY_SONG: SongFacets = {
  whole: [],
  style: [],
  moodVibe: [],
  themes: [],
  tags: new Map(),
};

const EMPTY_PLAYLIST: PlaylistFacets = {
  whole: [],
  songVectors: [],
  style: [],
  moodVibe: [],
  themes: [],
  tags: new Map(),
};

describe('playlistSongSimilarity', () => {
  it('uses the centroid alone when a playlist has no read songs', () => {
    const value = playlistSongSimilarity([1, 0], [1, 0], []);
    expect(value).toBeCloseTo(1, 10);
  });

  it('uses the nearest songs alone when there is no centroid', () => {
    // Both songs fall inside top-k, so the value is their mean: 1 and 0.
    expect(playlistSongSimilarity([1, 0], [], [[1, 0], [0, 1]])).toBeCloseTo(0.5, 10);
  });

  it('rescues a song that fits one cluster of a split playlist', () => {
    // Two clusters at right angles. Their centroid sits between them, close to
    // neither, which is exactly the case a centroid-only score gets wrong.
    const clusterA = [
      [1, 0, 0],
      [0.98, 0.2, 0],
    ];
    const clusterB = [
      [0, 1, 0],
      [0.2, 0.98, 0],
    ];
    const songVectors = [...clusterA, ...clusterB];
    const centroidVector = [0.5, 0.5, 0];
    const song = [1, 0, 0];

    const centroidOnly = playlistSongSimilarity(song, centroidVector, []);
    const combined = playlistSongSimilarity(song, centroidVector, songVectors);

    expect(combined!).toBeGreaterThan(centroidOnly!);
  });

  it('averages only the configured number of neighbours', () => {
    const { topK } = MATCHING_CONFIG.components.playlistSongs;
    const near = Array.from({ length: topK }, () => [1, 0]);
    const far = Array.from({ length: 20 }, () => [0, 1]);

    const withFar = playlistSongSimilarity([1, 0], [], [...near, ...far]);
    // The far songs are beyond top-k, so they cannot drag the value down.
    expect(withFar).toBeCloseTo(1, 10);
  });

  it('returns null when there is nothing at all to compare', () => {
    expect(playlistSongSimilarity([1, 0], [], [])).toBeNull();
  });
});

describe('scoreComponents', () => {
  const song: SongFacets = {
    whole: [1, 0, 0],
    style: [1, 0, 0],
    moodVibe: [1, 0, 0],
    themes: [1, 0, 0],
    tags: new Map([['shoegaze', 2]]),
  };

  it('drops components it cannot compare and renormalises the rest', () => {
    const playlist: PlaylistFacets = {
      ...EMPTY_PLAYLIST,
      whole: [1, 0, 0],
      songVectors: [[1, 0, 0]],
    };
    const result = scoreComponents(song, playlist);

    const carried = result.components.filter((c) => c.weight > 0);
    expect(carried.map((c) => c.name)).toEqual(['playlistSongs']);
    expect(carried[0].weight).toBeCloseTo(1, 10);

    const absent = result.components.filter((c) => c.similarity === null);
    expect(absent.every((c) => c.weight === 0)).toBe(true);
  });

  it('keeps every weight summing to one across available components', () => {
    const playlist: PlaylistFacets = {
      whole: [1, 0, 0],
      songVectors: [[1, 0, 0]],
      style: [1, 0, 0],
      moodVibe: [0, 1, 0],
      themes: [0, 0, 1],
      tags: new Map([['shoegaze', 2]]),
    };
    const total = scoreComponents(song, playlist).components.reduce(
      (sum, c) => sum + c.weight,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it('does not let one perfectly aligned facet carry the whole score', () => {
    // Mood matches exactly; everything else is orthogonal. This is the
    // "feminine" case: one strong word must not stand in for the rest.
    const playlist: PlaylistFacets = {
      whole: [0, 1, 0],
      songVectors: [[0, 1, 0]],
      style: [0, 1, 0],
      moodVibe: [1, 0, 0],
      themes: [0, 1, 0],
      tags: new Map([['pop', 1]]),
    };
    const result = scoreComponents(song, playlist);
    const mood = result.components.find((c) => c.name === 'moodVibe');

    expect(mood?.score).toBe(100);
    // Mood is weighted at 20%, so a perfect mood alone cannot pass halfway.
    expect(result.score).toBeLessThan(50);
  });

  it('scores an all-round match above a single-facet one', () => {
    const aligned: PlaylistFacets = {
      whole: [1, 0, 0],
      songVectors: [[1, 0, 0]],
      style: [1, 0, 0],
      moodVibe: [1, 0, 0],
      themes: [1, 0, 0],
      tags: new Map([['shoegaze', 2]]),
    };
    const moodOnly: PlaylistFacets = {
      whole: [0, 1, 0],
      songVectors: [[0, 1, 0]],
      style: [0, 1, 0],
      moodVibe: [1, 0, 0],
      themes: [0, 1, 0],
      tags: new Map([['pop', 1]]),
    };
    expect(scoreComponents(song, aligned).score).toBeGreaterThan(
      scoreComponents(song, moodOnly).score,
    );
  });

  it('produces a score of zero when nothing can be compared', () => {
    const result = scoreComponents(EMPTY_SONG, EMPTY_PLAYLIST);
    expect(result.score).toBe(0);
    expect(result.components.every((c) => c.similarity === null)).toBe(true);
  });

  it('keeps the combined value and the score in step', () => {
    const playlist: PlaylistFacets = {
      ...EMPTY_PLAYLIST,
      whole: [0.7, 0.7, 0],
      songVectors: [[0.7, 0.7, 0]],
    };
    const result = scoreComponents(song, playlist);
    expect(result.score).toBe(Math.round(result.combined * 100));
    expect(result.combined).toBeGreaterThanOrEqual(0);
    expect(result.combined).toBeLessThanOrEqual(1);
  });
});
