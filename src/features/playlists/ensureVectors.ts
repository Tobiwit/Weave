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
import { profileEmbeddingText } from '../matching';
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
