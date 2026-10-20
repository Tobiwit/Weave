import { describe, expect, it } from 'vitest';
import type { Song } from '../../types';
import { foldRecordings, isSameSong, rankRecordings, type MbRecording } from './index';

const song: Song = { id: 's', title: 'Blinding Lights', artist: 'The Weeknd' };

const recording = (patch: Partial<MbRecording>): MbRecording => ({
  id: 'r',
  title: 'Blinding Lights',
  'artist-credit': [{ name: 'The Weeknd' }],
  ...patch,
});

describe('isSameSong', () => {
  it('accepts another pressing of the same song', () => {
    expect(isSameSong(recording({}), song)).toBe(true);
  });

  it('rejects a remix, a live take and another artist', () => {
    expect(isSameSong(recording({ title: 'Blinding Lights (Major Lazer remix)' }), song)).toBe(false);
    expect(isSameSong(recording({ title: 'Blinding Lights - Live' }), song)).toBe(false);
    expect(isSameSong(recording({ 'artist-credit': [{ name: 'Teddy Swims' }] }), song)).toBe(false);
  });
});

describe('rankRecordings', () => {
  it('puts the earliest studio recording ahead of a later live one', () => {
    const original = recording({
      id: 'original',
      'first-release-date': '2019-11-29',
      releases: [{ title: 'After Hours', 'release-group': { 'primary-type': 'Album' } }],
      isrcs: ['USUG11904206'],
    });
    const live = recording({
      id: 'live',
      'first-release-date': '2023-03-03',
      releases: [
        {
          title: 'Live at SoFi Stadium',
          'release-group': { 'primary-type': 'Album', 'secondary-types': ['Live'] },
        },
      ],
      isrcs: ['USUG12301431'],
    });
    expect(rankRecordings([live, original])[0].id).toBe('original');
  });
});

describe('foldRecordings', () => {
  it('pools every ISRC and recording id, and names the studio album', () => {
    const result = foldRecordings(
      [
        recording({
          id: 'a',
          'first-release-date': '2019-11-29',
          releases: [
            { title: 'Blinding Lights', date: '2019-11-29', 'release-group': { 'primary-type': 'Single' } },
            { title: 'After Hours', date: '2020-03-20', 'release-group': { 'primary-type': 'Album' } },
          ],
          isrcs: ['ONE'],
          tags: [{ name: 'synth-pop', count: 3 }],
        }),
        recording({ id: 'b', isrcs: ['TWO'], tags: [{ name: 'synth-pop', count: 2 }, { name: 'soul', count: 1 }] }),
      ],
      song,
    );
    expect(result.patch.album).toBe('After Hours');
    expect(result.patch.year).toBe(2019);
    expect(result.patch.altIsrcs).toEqual(['ONE', 'TWO']);
    expect(result.patch.altMbids).toEqual(['a', 'b']);
    expect(result.genres[0]).toBe('synth-pop');
  });
});

describe('pickTrack', () => {
  it('prefers the most canonical ISRC over the order the source answered in', async () => {
    const { pickTrack } = await import('../audio');
    const tracks = [
      { id: 'live', isrc: 'LIVE' },
      { id: 'studio', isrc: 'STUDIO' },
    ];
    expect(pickTrack(tracks, ['STUDIO', 'LIVE'])?.id).toBe('studio');
  });
});
