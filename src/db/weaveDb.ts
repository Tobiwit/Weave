import Dexie, { type Table } from 'dexie';
import type {
  AnalysisCacheEntry,
  Playlist,
  SettingsRecord,
  Song,
  SongProfile,
} from '../types';

export interface StoredSong extends Song {
  /** When the song first entered the local library, used for Recent. */
  addedAt: number;
  lastSeenAt: number;
}

/** Where each syncable table has been reconciled up to, per signed-in user. */
export interface SyncMetaRecord {
  key: string;
  value: unknown;
}

export interface EmbeddingRecord {
  /** `${providerId}:${hash of text}` */
  key: string;
  providerId: string;
  vector: number[];
  createdAt: number;
}

/**
 * Local-first store.
 *
 * Schema versioning strategy: never edit an existing `version(n).stores(...)`
 * block. Add a new `version(n + 1)` with the full store definition and an
 * `.upgrade()` when existing rows need reshaping. Dexie replays the chain for
 * users arriving from any earlier version, so an installed PWA keeps its
 * library across releases.
 */
export class WeaveDatabase extends Dexie {
  songs!: Table<StoredSong, string>;
  songProfiles!: Table<SongProfile, string>;
  playlists!: Table<Playlist, string>;
  analysisCache!: Table<AnalysisCacheEntry, string>;
  embeddings!: Table<EmbeddingRecord, string>;
  settings!: Table<SettingsRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor() {
    super('weave');

    this.version(1).stores({
      songs: 'id, artist, title, addedAt, lastSeenAt',
      songProfiles: 'songId, updatedAt',
      playlists: 'id, name, updatedAt',
      analysisCache: 'key, createdAt',
      embeddings: 'key, providerId, createdAt',
      settings: 'key',
    });

    // v2 adds soft deletes and sync bookkeeping. Indexing deletedAt lets the
    // sync engine find tombstones without scanning every row.
    this.version(2)
      .stores({
        songs: 'id, artist, title, addedAt, lastSeenAt',
        songProfiles: 'songId, updatedAt, deletedAt',
        playlists: 'id, name, updatedAt, deletedAt',
        analysisCache: 'key, createdAt',
        embeddings: 'key, providerId, createdAt',
        settings: 'key',
        syncMeta: 'key',
      })
      .upgrade(async (tx) => {
        // Existing rows predate the field entirely; leaving deletedAt absent is
        // correct, and Dexie indexes absent values as simply not present.
        await tx.table('playlists').toCollection().modify((playlist) => {
          if (typeof playlist.updatedAt !== 'number') {
            playlist.updatedAt = playlist.createdAt ?? Date.now();
          }
        });
      });
  }
}

export const db = new WeaveDatabase();

/** Current schema version, surfaced in Settings for support purposes. */
export const DB_VERSION = 2;
