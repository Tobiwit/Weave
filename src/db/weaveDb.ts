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
  }
}

export const db = new WeaveDatabase();

/** Current schema version, surfaced in Settings for support purposes. */
export const DB_VERSION = 1;
