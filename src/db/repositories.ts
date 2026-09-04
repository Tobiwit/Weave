import type { Playlist, Song, SongProfile } from '../types';
import { db, type EmbeddingRecord, type StoredSong } from './weaveDb';

export function createId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

/* ------------------------------- songs ---------------------------------- */

export async function upsertSong(song: Song): Promise<StoredSong> {
  const now = Date.now();
  const existing = await db.songs.get(song.id);
  const record: StoredSong = {
    ...existing,
    ...song,
    addedAt: existing?.addedAt ?? now,
    lastSeenAt: now,
  };
  await db.songs.put(record);
  return record;
}

export function getSong(id: string): Promise<StoredSong | undefined> {
  return db.songs.get(id);
}

export function getSongs(ids: string[]): Promise<StoredSong[]> {
  return db.songs.bulkGet(ids).then((rows) => rows.filter(Boolean) as StoredSong[]);
}

export async function getRecentSongs(limit = 8): Promise<StoredSong[]> {
  const rows = await db.songs.orderBy('lastSeenAt').reverse().limit(limit).toArray();
  return rows;
}

/* ---------------------------- song profiles ------------------------------ */

export async function saveSongProfile(profile: SongProfile): Promise<void> {
  await db.songProfiles.put({ ...profile, updatedAt: Date.now() });
}

export function getSongProfile(songId: string): Promise<SongProfile | undefined> {
  return db.songProfiles.get(songId);
}

export function getSongProfiles(songIds: string[]): Promise<SongProfile[]> {
  return db.songProfiles
    .bulkGet(songIds)
    .then((rows) => rows.filter(Boolean) as SongProfile[]);
}

export async function getAllSongProfiles(): Promise<SongProfile[]> {
  const rows = await db.songProfiles.toArray();
  return rows.filter((profile) => !profile.deletedAt);
}

/* ------------------------------ playlists -------------------------------- */

export async function getAllPlaylists(): Promise<Playlist[]> {
  const rows = await db.playlists.orderBy('updatedAt').reverse().toArray();
  return rows.filter((playlist) => !playlist.deletedAt);
}

/** Includes tombstones. Only the sync engine should need this. */
export function getAllPlaylistsRaw(): Promise<Playlist[]> {
  return db.playlists.toArray();
}

export async function getPlaylist(id: string): Promise<Playlist | undefined> {
  const playlist = await db.playlists.get(id);
  return playlist?.deletedAt ? undefined : playlist;
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  await db.playlists.put({ ...playlist, updatedAt: Date.now() });
}

export async function createPlaylist(
  input: Pick<Playlist, 'name' | 'keywords'> & Partial<Playlist>,
): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: input.id ?? createId('pl'),
    name: input.name,
    description: input.description,
    keywords: input.keywords,
    songIds: input.songIds ?? [],
    keywordEmbedding: input.keywordEmbedding,
    centroidEmbedding: input.centroidEmbedding,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await db.playlists.put(playlist);
  return playlist;
}

/**
 * Soft delete. The row stays as a tombstone so the deletion can reach other
 * devices; a hard delete would look identical to "never seen it" and the
 * playlist would come back on the next sync.
 */
export async function deletePlaylist(id: string): Promise<void> {
  const playlist = await db.playlists.get(id);
  if (!playlist) return;
  const now = Date.now();
  await db.playlists.put({ ...playlist, deletedAt: now, updatedAt: now });
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
): Promise<Playlist | undefined> {
  const playlist = await db.playlists.get(playlistId);
  if (!playlist) return undefined;
  if (playlist.songIds.includes(songId)) return playlist;
  const next: Playlist = {
    ...playlist,
    songIds: [...playlist.songIds, songId],
    updatedAt: Date.now(),
  };
  await db.playlists.put(next);
  return next;
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string,
): Promise<Playlist | undefined> {
  const playlist = await db.playlists.get(playlistId);
  if (!playlist) return undefined;
  const next: Playlist = {
    ...playlist,
    songIds: playlist.songIds.filter((id) => id !== songId),
    updatedAt: Date.now(),
  };
  await db.playlists.put(next);
  return next;
}

/* ------------------------------ embeddings ------------------------------- */

export function getEmbeddingRecord(key: string): Promise<EmbeddingRecord | undefined> {
  return db.embeddings.get(key);
}

export function getEmbeddingRecords(keys: string[]): Promise<(EmbeddingRecord | undefined)[]> {
  return db.embeddings.bulkGet(keys);
}

export async function putEmbeddingRecords(records: EmbeddingRecord[]): Promise<void> {
  if (records.length === 0) return;
  await db.embeddings.bulkPut(records);
}

/* -------------------------------- cache ---------------------------------- */

export async function readCache<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  const entry = await db.analysisCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > maxAgeMs) return undefined;
  return entry.value as T;
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await db.analysisCache.put({ key, value, createdAt: Date.now() });
}

/* ------------------------------- settings -------------------------------- */

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.songs.clear(),
    db.songProfiles.clear(),
    db.playlists.clear(),
    db.analysisCache.clear(),
    db.embeddings.clear(),
    db.settings.clear(),
  ]);
}

export async function clearEmbeddingCache(): Promise<void> {
  await db.embeddings.clear();
}
