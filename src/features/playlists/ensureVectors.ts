import { VECTOR_RECIPE_VERSION } from '../../config/embedding';
import {
  getAllPlaylists,
  getSongProfiles,
  saveSongProfile,
} from '../../db/repositories';
import { embeddingService } from '../../services/embedding';
import type { Playlist, SongProfile } from '../../types';
import { profileEmbeddingText } from '../matching';
import { updatePlaylistVectors } from './playlistEngine';

/** Embeds a profile on demand, so nothing is computed until it is needed. */
export async function ensureProfileEmbedding(
  profile: SongProfile,
): Promise<SongProfile> {
  if (profile.semanticEmbedding?.length) return profile;
  const semanticEmbedding = await embeddingService.embed(
    profileEmbeddingText(profile),
  );
  const next = { ...profile, semanticEmbedding };
  await saveSongProfile(next);
  return next;
}

export async function ensureProfileEmbeddings(
  profiles: SongProfile[],
): Promise<SongProfile[]> {
  const missing = profiles.filter((p) => !p.semanticEmbedding?.length);
  if (missing.length === 0) return profiles;

  const vectors = await embeddingService.embedMany(
    missing.map(profileEmbeddingText),
  );
  const updated = new Map<string, SongProfile>();
  await Promise.all(
    missing.map(async (profile, index) => {
      const next = { ...profile, semanticEmbedding: vectors[index] };
      updated.set(profile.songId, next);
      await saveSongProfile(next);
    }),
  );

  return profiles.map((profile) => updated.get(profile.songId) ?? profile);
}

/**
 * Brings a playlist vector up to date, embedding any of its songs that have
 * not been embedded yet.
 */
export async function ensurePlaylistVectors(playlist: Playlist): Promise<Playlist> {
  const profiles = await getSongProfiles(playlist.songIds);
  await ensureProfileEmbeddings(profiles);
  return updatePlaylistVectors(playlist);
}

/**
 * Prepares every playlist vector in the library. Used by Universe and by the
 * match reveal, both of which need the whole space to be comparable.
 */
export async function ensureLibraryVectors(): Promise<Playlist[]> {
  const playlists = await getAllPlaylists();
  const prepared: Playlist[] = [];
  for (const playlist of playlists) {
    const needsWork =
      playlist.vectorVersion !== VECTOR_RECIPE_VERSION ||
      !playlist.keywordEmbedding?.length ||
      (playlist.songIds.length > 0 && !playlist.centroidEmbedding?.length);
    prepared.push(needsWork ? await ensurePlaylistVectors(playlist) : playlist);
  }
  return prepared;
}
