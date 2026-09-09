import {
  PROFILE_EMBEDDING_VERSION,
  VECTOR_RECIPE_VERSION,
} from '../../config/embedding';
import {
  getAllPlaylists,
  getSongProfiles,
  saveSongProfile,
} from '../../db/repositories';
import { embeddingService } from '../../services/embedding';
import type { Playlist, SongProfile } from '../../types';
import {
  cosineSimilarity,
  profileEmbeddingText,
  type MeasuredCalibration,
} from '../matching';
import { recalibrateLibrary } from './measureCalibration';
import { updatePlaylistVectors } from './playlistEngine';

/**
 * Whether a stored vector can be compared with a freshly built one.
 *
 * A missing vector obviously has to be built. A vector from an older recipe is
 * worse than missing: it sits in a different region of the space and would
 * quietly score against everything else as though it belonged there.
 */
export function needsEmbedding(profile: SongProfile): boolean {
  return (
    !profile.semanticEmbedding?.length ||
    profile.embeddingVersion !== PROFILE_EMBEDDING_VERSION
  );
}

/** Embeds a profile on demand, so nothing is computed until it is needed. */
export async function ensureProfileEmbedding(
  profile: SongProfile,
): Promise<SongProfile> {
  if (!needsEmbedding(profile)) return profile;
  const semanticEmbedding = await embeddingService.embed(
    profileEmbeddingText(profile),
  );
  const next = {
    ...profile,
    semanticEmbedding,
    embeddingVersion: PROFILE_EMBEDDING_VERSION,
  };
  await saveSongProfile(next);
  return next;
}

export async function ensureProfileEmbeddings(
  profiles: SongProfile[],
): Promise<SongProfile[]> {
  const stale = profiles.filter(needsEmbedding);
  if (stale.length === 0) return profiles;

  const vectors = await embeddingService.embedMany(
    stale.map(profileEmbeddingText),
  );
  const updated = new Map<string, SongProfile>();
  await Promise.all(
    stale.map(async (profile, index) => {
      const next = {
        ...profile,
        semanticEmbedding: vectors[index],
        embeddingVersion: PROFILE_EMBEDDING_VERSION,
      };
      updated.set(profile.songId, next);
      await saveSongProfile(next);
    }),
  );

  return profiles.map((profile) => updated.get(profile.songId) ?? profile);
}

/**
 * Brings a playlist vector up to date, embedding any of its songs whose vector
 * is missing or built from a superseded recipe.
 */
export async function ensurePlaylistVectors(playlist: Playlist): Promise<Playlist> {
  const profiles = await getSongProfiles(playlist.songIds);
  await ensureProfileEmbeddings(profiles);
  return updatePlaylistVectors(playlist);
}

/**
 * Rebuilds a playlist's representation from scratch.
 *
 * What the Reevaluate button runs. Unlike the backfill it does not ask whether
 * anything looks stale: it re-derives every member's vector from the canonical
 * text and then recomputes the playlist's own vectors from those.
 *
 * That matters because plenty can change without the version moving. Editing a
 * song's descriptors, correcting its mood, rewriting the playlist's keywords or
 * adding songs all change what the playlist means while every stored vector
 * still looks current. Rebuilding is cheap regardless: embeddings are cached by
 * the exact text they came from, so anything genuinely unchanged is a lookup
 * rather than a recomputation.
 */
export interface RebuildReport {
  playlist: Playlist;
  /** Member songs whose vector was rebuilt. */
  songs: number;
  /** How many of those actually came out different. */
  changed: number;
  /**
   * How far the playlist's centre moved, as one minus the cosine between the
   * old centroid and the new one. Zero means nothing about what this playlist
   * means has changed, which is the usual and correct outcome.
   */
  centroidShift: number;
  /** Songs in the playlist with no reading yet, so they contributed nothing. */
  unread: number;
}

export async function rebuildPlaylistRepresentation(
  playlist: Playlist,
): Promise<RebuildReport> {
  const before = playlist.centroidEmbedding;
  const profiles = await getSongProfiles(playlist.songIds);
  let changed = 0;

  if (profiles.length > 0) {
    const vectors = await embeddingService.embedMany(
      profiles.map(profileEmbeddingText),
    );
    await Promise.all(
      profiles.map((profile, index) => {
        const next = vectors[index];
        if (!sameVector(profile.semanticEmbedding, next)) changed += 1;
        return saveSongProfile({
          ...profile,
          semanticEmbedding: next,
          embeddingVersion: PROFILE_EMBEDDING_VERSION,
        });
      }),
    );
  }

  const rebuilt = await updatePlaylistVectors(playlist);
  const after = rebuilt.centroidEmbedding;

  const centroidShift =
    before?.length && after?.length ? 1 - cosineSimilarity(before, after) : 0;

  return {
    playlist: rebuilt,
    songs: profiles.length,
    changed,
    centroidShift: Math.max(0, centroidShift),
    unread: playlist.songIds.length - profiles.length,
  };
}

function sameVector(a: number[] | undefined, b: number[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  // Exact equality is the right test: the same text through the same model
  // gives the same numbers, so any difference at all is a real difference.
  return a.every((value, index) => value === b[index]);
}

/**
 * Rebuilds every playlist in the library.
 *
 * Rarity is measured across playlists, so a word's weight depends on the whole
 * library rather than on any one playlist. Adding a rock playlist to a library
 * of indie pop changes what "indie pop" is worth everywhere at once, and only a
 * pass over all of them puts every playlist back in step.
 */
export interface LibraryRebuildResult {
  reports: RebuildReport[];
  /** The bands the library measured for itself, when there was enough to measure. */
  calibration: MeasuredCalibration | null;
}

export async function rebuildLibraryRepresentation(
  onProgress?: (done: number, total: number) => void,
): Promise<LibraryRebuildResult> {
  const playlists = await getAllPlaylists();
  const reports: RebuildReport[] = [];

  for (const [index, playlist] of playlists.entries()) {
    reports.push(await rebuildPlaylistRepresentation(playlist));
    onProgress?.(index + 1, playlists.length);
  }

  // The score bands are a property of the library, not of any playlist, and
  // they can only be measured once every vector is current.
  const calibration = await recalibrateLibrary(
    reports.map((report) => report.playlist),
  ).catch(() => null);

  return { reports, calibration };
}

/**
 * Prepares every playlist vector in the library. Used by Universe and by the
 * match reveal, both of which need the whole space to be comparable.
 */
export async function ensureLibraryVectors(): Promise<Playlist[]> {
  const playlists = await getAllPlaylists();
  const prepared: Playlist[] = [];
  for (const playlist of playlists) {
    const profiles = await getSongProfiles(playlist.songIds);
    const needsWork =
      playlist.vectorVersion !== VECTOR_RECIPE_VERSION ||
      !playlist.keywordEmbedding?.length ||
      (playlist.songIds.length > 0 && !playlist.centroidEmbedding?.length) ||
      profiles.some(needsEmbedding);
    prepared.push(needsWork ? await ensurePlaylistVectors(playlist) : playlist);
  }
  return prepared;
}
