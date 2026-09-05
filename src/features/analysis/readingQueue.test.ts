import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song, SongProfile } from '../../types';

/**
 * The queue's whole job is sequencing, so these exercise the order and the
 * stopping conditions rather than the analysis it delegates to.
 */

const songs = new Map<string, Song>();
const profiles = new Map<string, SongProfile>();
const settings = new Map<string, unknown>();

/** Resolvers for reads in flight, so a test decides when a song finishes. */
let pending: { songId: string; resolve: () => void; reject: () => void }[] = [];
let concurrent = 0;
let maxConcurrent = 0;
const readOrder: string[] = [];

vi.mock('../../db/repositories', () => ({
  getSong: async (id: string) => songs.get(id),
  getSongProfile: async (id: string) => profiles.get(id),
  readSetting: async (key: string, fallback: unknown) =>
    settings.has(key) ? settings.get(key) : fallback,
  writeSetting: async (key: string, value: unknown) => {
    settings.set(key, value);
  },
}));

const ensureLibraryVectors = vi.fn(async () => []);
vi.mock('../playlists/ensureVectors', () => ({
  ensureLibraryVectors: () => ensureLibraryVectors(),
}));

vi.mock('./analysisRegistry', () => ({
  readSong: (song: Song) => {
    readOrder.push(song.id);
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    return new Promise<SongProfile>((resolve, reject) => {
      pending.push({
        songId: song.id,
        resolve: () => {
          concurrent -= 1;
          profiles.set(song.id, { songId: song.id } as SongProfile);
          resolve({ songId: song.id } as SongProfile);
        },
        reject: () => {
          concurrent -= 1;
          reject(new Error('unreadable'));
        },
      });
    });
  },
}));

type Queue = typeof import('./readingQueue');

async function load(): Promise<Queue> {
  vi.resetModules();
  return import('./readingQueue');
}

function addSong(id: string): void {
  songs.set(id, { id, title: `Song ${id}`, artist: 'Artist' });
}

/** Runs timers until the queue hands the next song to `readSong`, or gives up. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20 && pending.length === 0; i += 1) {
    await vi.advanceTimersByTimeAsync(50);
  }
}

/** Finishes the read in flight and waits for the queue to reach the next one. */
async function finishOne(outcome: 'ok' | 'fail' = 'ok'): Promise<void> {
  const next = pending.shift();
  if (!next) return;
  if (outcome === 'ok') next.resolve();
  else next.reject();
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  songs.clear();
  profiles.clear();
  settings.clear();
  pending = [];
  concurrent = 0;
  maxConcurrent = 0;
  readOrder.length = 0;
  ensureLibraryVectors.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reading queue', () => {
  it('reads one song at a time, in the order given', async () => {
    const queue = await load();
    ['a', 'b', 'c'].forEach(addSong);

    const taken = await queue.enqueueReading(['a', 'b', 'c']);
    expect(taken).toBe(3);

    await settle();
    expect(maxConcurrent).toBe(1);
    expect(queue.getReadingQueueState().current?.songId).toBe('a');

    await finishOne();
    await finishOne();
    await finishOne();

    expect(readOrder).toEqual(['a', 'b', 'c']);
    expect(maxConcurrent).toBe(1);
  });

  it('does not queue songs that have already been read', async () => {
    const queue = await load();
    ['a', 'b'].forEach(addSong);
    profiles.set('a', { songId: 'a' } as SongProfile);

    const taken = await queue.enqueueReading(['a', 'b']);
    expect(taken).toBe(1);

    await settle();
    expect(readOrder).toEqual(['b']);
  });

  it('ignores a song that is already queued', async () => {
    const queue = await load();
    ['a', 'b'].forEach(addSong);

    await queue.enqueueReading(['a', 'b']);
    await settle();
    expect(await queue.enqueueReading(['a', 'b'])).toBe(0);
    expect(queue.getReadingQueueState().total).toBe(2);
  });

  it('counts a failure and carries on with the rest', async () => {
    const queue = await load();
    ['a', 'b'].forEach(addSong);

    await queue.enqueueReading(['a', 'b']);
    await settle();
    await finishOne('fail');
    await finishOne('ok');

    const state = queue.getReadingQueueState();
    expect(state.failed).toBe(1);
    expect(state.done).toBe(1);
    expect(readOrder).toEqual(['a', 'b']);
  });

  it('stops itself once failures look like a provider being down', async () => {
    const queue = await load();
    ['a', 'b', 'c', 'd', 'e'].forEach(addSong);

    await queue.enqueueReading(['a', 'b', 'c', 'd', 'e']);
    await settle();
    await finishOne('fail');
    await finishOne('fail');
    await finishOne('fail');

    const state = queue.getReadingQueueState();
    expect(state.paused).toBe(true);
    expect(state.failed).toBe(3);
    // The two it never tried are still waiting, not discarded.
    expect(state.pending).toEqual(['d', 'e']);
    expect(readOrder).toEqual(['a', 'b', 'c']);
  });

  it('resumes a batch it paused', async () => {
    const queue = await load();
    ['a', 'b', 'c', 'd'].forEach(addSong);

    await queue.enqueueReading(['a', 'b', 'c', 'd']);
    await settle();
    await finishOne('fail');
    await finishOne('fail');
    await finishOne('fail');
    expect(queue.getReadingQueueState().paused).toBe(true);

    queue.resumeReading();
    await settle();
    expect(readOrder).toEqual(['a', 'b', 'c', 'd']);
  });

  it('abandons the rest when stopped', async () => {
    const queue = await load();
    ['a', 'b', 'c'].forEach(addSong);

    await queue.enqueueReading(['a', 'b', 'c']);
    await settle();
    await queue.stopReading();
    await finishOne();

    expect(readOrder).toEqual(['a']);
    expect(queue.getReadingQueueState().pending).toEqual([]);
  });

  it('rebuilds library vectors once, after the batch finishes', async () => {
    const queue = await load();
    ['a', 'b'].forEach(addSong);

    await queue.enqueueReading(['a', 'b']);
    await settle();
    await finishOne();
    expect(ensureLibraryVectors).not.toHaveBeenCalled();

    await finishOne();
    expect(ensureLibraryVectors).toHaveBeenCalledTimes(1);
  });

  it('picks up a batch left over from a previous visit', async () => {
    const first = await load();
    ['a', 'b'].forEach(addSong);
    await first.enqueueReading(['a', 'b']);
    await settle();
    await finishOne();
    // Whatever was persisted at this point is what a reload would find.

    pending = [];
    readOrder.length = 0;

    const second = await load();
    await second.restoreReadingQueue();
    await settle();

    expect(readOrder).toEqual(['b']);
    expect(second.getReadingQueueState().total).toBe(2);
  });

  it('starts a fresh count rather than adding to a finished batch', async () => {
    const queue = await load();
    ['a', 'b'].forEach(addSong);

    await queue.enqueueReading(['a']);
    await settle();
    await finishOne();
    expect(queue.getReadingQueueState().total).toBe(1);

    await queue.enqueueReading(['b']);
    const state = queue.getReadingQueueState();
    expect(state.total).toBe(1);
    expect(state.done).toBe(0);
  });
});
