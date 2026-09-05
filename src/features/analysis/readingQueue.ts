import {
  getSong,
  getSongProfile,
  readSetting,
  writeSetting,
} from '../../db/repositories';
import { ensureLibraryVectors } from '../playlists/ensureVectors';
import { readSong } from './analysisRegistry';

/**
 * Reads a batch of songs in the background, one at a time.
 *
 * Importing a playlist brings in identity only; the reading of each song is
 * Weave's own work and costs four small requests plus an embedding. Clicking
 * through fifty songs by hand is not a real option, and firing fifty analyses
 * at once is worse: MusicBrainz asks for no more than one request a second and
 * answers a flood with errors rather than data.
 *
 * So the queue is strictly serial. That is not a throttle bolted on top — the
 * MusicBrainz limiter inside the metadata provider already paces one song
 * against the next, which puts a whole batch at roughly two to three seconds
 * per song and every provider comfortably inside its limits. Fifty songs is a
 * couple of minutes of quiet background work.
 *
 * The queue is persisted, so closing the app mid-batch resumes rather than
 * loses the rest. It is never invisible: whenever it holds work, the shell
 * shows what it is doing and offers a way to stop.
 */

const QUEUE_KEY = 'analysis.queue';

/**
 * Consecutive failures that mean the problem is not these particular songs.
 * A provider being down should stop the batch, not burn through it failing.
 */
const FAILURE_LIMIT = 3;

/** A beat between songs. The providers are someone else's servers. */
const GAP_MS = 300;

export interface ReadingTarget {
  songId: string;
  title: string;
  artist: string;
}

export interface ReadingQueueState {
  /** Songs still waiting, not counting the one in flight. */
  pending: string[];
  current: ReadingTarget | null;
  done: number;
  failed: number;
  /** Everything this batch set out to read, so progress has a denominator. */
  total: number;
  running: boolean;
  /** Stopped itself after repeated failures; waiting to be told to continue. */
  paused: boolean;
  /** Stopped because the device went offline. Resumes on its own. */
  waitingForNetwork: boolean;
}

const IDLE: ReadingQueueState = {
  pending: [],
  current: null,
  done: 0,
  failed: 0,
  total: 0,
  running: false,
  paused: false,
  waitingForNetwork: false,
};

interface StoredQueue {
  pending: string[];
  done: number;
  failed: number;
  total: number;
}

let state: ReadingQueueState = IDLE;
let pumping = false;
let stopped = false;

const listeners = new Set<(state: ReadingQueueState) => void>();

export function getReadingQueueState(): ReadingQueueState {
  return state;
}

export function subscribeToReadingQueue(
  listener: (state: ReadingQueueState) => void,
): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function publish(patch: Partial<ReadingQueueState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

async function persist(): Promise<void> {
  const { pending, done, failed, total } = state;
  await writeSetting(QUEUE_KEY, {
    pending,
    done,
    failed,
    total,
  } satisfies StoredQueue).catch(() => undefined);
}

/** Absent `navigator.onLine`, assume online: a wrong guess only costs a retry. */
function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adds songs to the batch, skipping anything already read or already queued.
 * Returns how many were actually taken on.
 */
export async function enqueueReading(songIds: string[]): Promise<number> {
  const queued = new Set([
    ...state.pending,
    ...(state.current ? [state.current.songId] : []),
  ]);

  const fresh: string[] = [];
  for (const songId of songIds) {
    if (queued.has(songId)) continue;
    queued.add(songId);
    const profile = await getSongProfile(songId).catch(() => undefined);
    if (!profile) fresh.push(songId);
  }

  if (fresh.length === 0) return 0;

  // A finished batch leaves its counts up so the UI can say what it did.
  // Adding to an idle queue starts a new batch rather than continuing that one.
  const continuing = state.running || state.pending.length > 0;

  stopped = false;
  publish({
    pending: [...state.pending, ...fresh],
    total: (continuing ? state.total : 0) + fresh.length,
    done: continuing ? state.done : 0,
    failed: continuing ? state.failed : 0,
    paused: false,
    waitingForNetwork: false,
  });
  await persist();
  void pump();
  return fresh.length;
}

/** Continues a batch that paused itself. */
export function resumeReading(): void {
  if (state.pending.length === 0) return;
  stopped = false;
  publish({ paused: false, waitingForNetwork: false });
  void pump();
}

/** Abandons what is left. Songs already read stay read. */
export async function stopReading(): Promise<void> {
  stopped = true;
  publish({ ...IDLE });
  await persist();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  publish({ running: true, waitingForNetwork: false });

  let consecutiveFailures = 0;

  try {
    while (state.pending.length > 0 && !stopped && !state.paused) {
      if (!online()) {
        publish({ waitingForNetwork: true });
        break;
      }

      const [songId, ...rest] = state.pending;
      publish({ pending: rest });

      const song = await getSong(songId).catch(() => undefined);
      // Read in the meantime, or removed from the library entirely. Either way
      // there is nothing left to do for it, and it still counts as accounted
      // for so progress reaches its total.
      const existing = song ? await getSongProfile(songId).catch(() => undefined) : undefined;
      if (!song || existing) {
        publish({ done: state.done + 1 });
        await persist();
        continue;
      }

      publish({ current: { songId, title: song.title, artist: song.artist } });
      let read = true;
      try {
        await readSong(song);
        consecutiveFailures = 0;
      } catch {
        // Analysis only rejects when the song cannot be identified at all;
        // every missing signal below that degrades on its own.
        read = false;
        consecutiveFailures += 1;
      }

      // Stopping mid-read still lets that read finish and be saved, but its
      // result belongs to a batch the user has already dismissed, so it does
      // not count towards one.
      if (stopped) break;

      publish(
        read
          ? { done: state.done + 1, current: null }
          : { failed: state.failed + 1, current: null },
      );
      await persist();

      if (consecutiveFailures >= FAILURE_LIMIT) {
        publish({ paused: true });
        break;
      }
      if (state.pending.length > 0) await delay(GAP_MS);
    }
  } finally {
    pumping = false;
    const finished = state.pending.length === 0 && !stopped;
    publish({ running: false, current: null });

    if (finished) {
      // The new readings are what a playlist's centre is made of, so the
      // vectors have to catch up before any of this shows in matching.
      await ensureLibraryVectors().catch(() => undefined);
      publish({ ...IDLE, done: state.done, failed: state.failed, total: state.total });
    }
    await persist();
  }
}

/**
 * Picks up a batch left unfinished by a previous visit.
 *
 * Called once during boot. Reading resumes on its own rather than waiting to
 * be asked again: the work was already requested, and the shell shows it.
 */
export async function restoreReadingQueue(): Promise<void> {
  const stored = await readSetting<StoredQueue | null>(QUEUE_KEY, null).catch(
    () => null,
  );
  if (!stored?.pending?.length) return;

  publish({
    pending: stored.pending,
    done: stored.done ?? 0,
    failed: stored.failed ?? 0,
    total: stored.total ?? stored.pending.length,
  });
  void pump();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (state.pending.length > 0 && !state.paused) void pump();
  });
}
