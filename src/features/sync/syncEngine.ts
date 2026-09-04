import { db, type StoredSong } from '../../db/weaveDb';
import type { Playlist, SongProfile } from '../../types';
import { getAuthState } from '../../services/cloud/auth';
import { getCloudClient } from '../../services/cloud/client';

/**
 * Optional library sync.
 *
 * IndexedDB stays the source of truth: every screen reads locally and keeps
 * working offline and signed out. This pushes what changed and pulls what the
 * account has, merging per record by `updatedAt` — last write wins.
 *
 * Embeddings are deliberately not synced. They are large, they are derivable
 * from the record they belong to, and `ensureLibraryVectors` already rebuilds
 * them on demand. A new device recomputes rather than downloading megabytes of
 * float arrays that would be invalidated by any model change anyway.
 */

export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error' | 'unavailable';

export interface SyncState {
  phase: SyncPhase;
  lastSyncedAt?: number;
  /** Human-readable, never a raw error. */
  message?: string;
  pushed?: number;
  pulled?: number;
}

const listeners = new Set<(state: SyncState) => void>();
let current: SyncState = { phase: 'idle' };
let running: Promise<SyncState> | null = null;

export function getSyncState(): SyncState {
  return current;
}

export function subscribeToSync(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: SyncState): void {
  current = next;
  for (const listener of listeners) listener(current);
}

const PUSHED_KEY = (userId: string) => `pushed:${userId}`;

async function readWatermark(key: string): Promise<number> {
  const row = await db.syncMeta.get(key);
  return typeof row?.value === 'number' ? row.value : 0;
}

async function writeWatermark(key: string, value: number): Promise<void> {
  await db.syncMeta.put({ key, value });
}

/** Strips vectors before upload; they are rebuilt locally on the far side. */
function stripPlaylist(playlist: Playlist) {
  const { keywordEmbedding: _k, centroidEmbedding: _c, vectorVersion: _v, ...rest } =
    playlist;
  return rest;
}

function stripProfile(profile: SongProfile) {
  const { semanticEmbedding: _e, ...rest } = profile;
  return rest;
}

interface RemoteRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Runs one reconcile. Concurrent calls share the in-flight run rather than
 * racing each other into conflicting writes.
 */
export async function syncNow(): Promise<SyncState> {
  if (running) return running;

  running = (async (): Promise<SyncState> => {
    const auth = getAuthState();
    if (auth.status !== 'signed-in' || !auth.account) {
      const state: SyncState = { phase: 'unavailable' };
      publish(state);
      return state;
    }

    const client = await getCloudClient();
    if (!client) {
      const state: SyncState = { phase: 'unavailable' };
      publish(state);
      return state;
    }

    const userId = auth.account.id;
    publish({ phase: 'syncing', lastSyncedAt: current.lastSyncedAt });

    try {
      let pulled = 0;
      let pushed = 0;

      /* ------------------------------ pull ------------------------------ */
      // A full pull rather than a windowed one: a personal library is small,
      // and it removes a whole class of watermark and clock-skew bugs.
      const [playlistRows, profileRows, songRows] = await Promise.all([
        client.from('playlists').select('id,data,updated_at,deleted_at').eq('user_id', userId),
        client.from('song_profiles').select('id,data,updated_at,deleted_at').eq('user_id', userId),
        client.from('songs').select('id,data,updated_at,deleted_at').eq('user_id', userId),
      ]);

      const firstError =
        playlistRows.error ?? profileRows.error ?? songRows.error ?? null;
      if (firstError) throw new Error(firstError.message);

      pulled += await mergePlaylists((playlistRows.data ?? []) as RemoteRow[]);
      pulled += await mergeProfiles((profileRows.data ?? []) as RemoteRow[]);
      pulled += await mergeSongs((songRows.data ?? []) as RemoteRow[]);

      /* ------------------------------ push ------------------------------ */
      const since = await readWatermark(PUSHED_KEY(userId));
      const now = Date.now();

      const localPlaylists = (await db.playlists.toArray()).filter(
        (row) => row.updatedAt > since,
      );
      const localProfiles = (await db.songProfiles.toArray()).filter(
        (row) => row.updatedAt > since,
      );
      // Songs carry no updatedAt of their own; lastSeenAt is the closest thing
      // to "changed", and re-sending a few extra rows is harmless.
      const localSongs = (await db.songs.toArray()).filter(
        (row) => row.lastSeenAt > since,
      );

      if (localPlaylists.length) {
        const { error } = await client.from('playlists').upsert(
          localPlaylists.map((playlist) => ({
            user_id: userId,
            id: playlist.id,
            data: stripPlaylist(playlist),
            updated_at: playlist.updatedAt,
            deleted_at: playlist.deletedAt ?? null,
          })),
        );
        if (error) throw new Error(error.message);
        pushed += localPlaylists.length;
      }

      if (localProfiles.length) {
        const { error } = await client.from('song_profiles').upsert(
          localProfiles.map((profile) => ({
            user_id: userId,
            id: profile.songId,
            data: stripProfile(profile),
            updated_at: profile.updatedAt,
            deleted_at: profile.deletedAt ?? null,
          })),
        );
        if (error) throw new Error(error.message);
        pushed += localProfiles.length;
      }

      if (localSongs.length) {
        const { error } = await client.from('songs').upsert(
          localSongs.map((song) => ({
            user_id: userId,
            id: song.id,
            data: song,
            updated_at: song.lastSeenAt,
            deleted_at: null,
          })),
        );
        if (error) throw new Error(error.message);
        pushed += localSongs.length;
      }

      await writeWatermark(PUSHED_KEY(userId), now);

      const state: SyncState = {
        phase: 'done',
        lastSyncedAt: Date.now(),
        pushed,
        pulled,
      };
      publish(state);
      return state;
    } catch {
      const state: SyncState = {
        phase: 'error',
        lastSyncedAt: current.lastSyncedAt,
        message: 'We could not reach your library just now. Nothing was lost.',
      };
      publish(state);
      return state;
    } finally {
      running = null;
    }
  })();

  return running;
}

/* ------------------------------- merging --------------------------------- */

async function mergePlaylists(rows: RemoteRow[]): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const local = await db.playlists.get(row.id);
    if (local && local.updatedAt >= row.updated_at) continue;

    const remote = row.data as unknown as Playlist;
    await db.playlists.put({
      ...remote,
      id: row.id,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
      // Vectors were never uploaded, so anything local is still the best copy.
      keywordEmbedding: local?.keywordEmbedding,
      centroidEmbedding: local?.centroidEmbedding,
      vectorVersion: local?.vectorVersion,
    });
    applied += 1;
  }
  return applied;
}

async function mergeProfiles(rows: RemoteRow[]): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const local = await db.songProfiles.get(row.id);
    if (local && local.updatedAt >= row.updated_at) continue;

    const remote = row.data as unknown as SongProfile;
    await db.songProfiles.put({
      ...remote,
      songId: row.id,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
      semanticEmbedding: local?.semanticEmbedding,
    });
    applied += 1;
  }
  return applied;
}

async function mergeSongs(rows: RemoteRow[]): Promise<number> {
  let applied = 0;
  for (const row of rows) {
    const local = await db.songs.get(row.id);
    if (local && local.lastSeenAt >= row.updated_at) continue;

    const remote = row.data as unknown as StoredSong;
    await db.songs.put({
      ...remote,
      id: row.id,
      // Keep whichever copy saw the song most recently.
      lastSeenAt: Math.max(row.updated_at, local?.lastSeenAt ?? 0),
      addedAt: Math.min(remote.addedAt ?? row.updated_at, local?.addedAt ?? Infinity),
      // A cover found on either device is worth keeping.
      artworkUrl: remote.artworkUrl ?? local?.artworkUrl,
    });
    applied += 1;
  }
  return applied;
}
