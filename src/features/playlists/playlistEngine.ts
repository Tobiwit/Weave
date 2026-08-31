import { VECTOR_RECIPE_VERSION } from '../../config/embedding';
import { getSongProfiles, savePlaylist } from '../../db/repositories';
import { embeddingService } from '../../services/embedding';
import type { Playlist, PlaylistMatch, SongProfile } from '../../types';
import {
  activeProfileTerms,
  calculateLeaveOneOutCentroid,
  calculatePlaylistVector,
  playlistEmbeddingText,
  playlistTerms,
  rankPlaylists,
  type PlaylistCandidate,
  type TermVectorResolver,
} from '../matching';

/**
 * Recomputes and persists a playlist vector.
 *
 * Called whenever a playlist changes: its stated world is embedded, the
 * centroid of its songs is recalculated, and the two are blended by the
 * weights in the matching config.
 */
export async function updatePlaylistVectors(playlist: Playlist): Promise<Playlist> {
  const keywordEmbedding = await embeddingService.embed(
    playlistEmbeddingText(playlist),
  );

  const profiles = await getSongProfiles(playlist.songIds);
  const songEmbeddings = profiles
    .map((profile) => profile.semanticEmbedding)
    .filter((vector): vector is number[] => Array.isArray(vector) && vector.length > 0);

  const { centroidEmbedding } = calculatePlaylistVector({
    keywordEmbedding,
    songEmbeddings,
  });

  const next: Playlist = {
    ...playlist,
    keywordEmbedding,
    centroidEmbedding: centroidEmbedding.length ? centroidEmbedding : undefined,
    vectorVersion: VECTOR_RECIPE_VERSION,
    updatedAt: Date.now(),
  };
  await savePlaylist(next);
  return next;
}

/** The blended vector a playlist is matched against. */
export function playlistVectorOf(playlist: Playlist): number[] {
  return calculatePlaylistVector({
    keywordEmbedding: playlist.keywordEmbedding,
    songEmbeddings: playlist.centroidEmbedding ? [playlist.centroidEmbedding] : [],
  }).vector;
}

export function toCandidate(playlist: Playlist): PlaylistCandidate {
  return {
    playlistId: playlist.id,
    vector: playlistVectorOf(playlist),
    terms: playlistTerms(playlist),
  };
}

/**
 * Embeds every descriptor involved in a comparison so explanations can be
 * semantic rather than string matching. One batched call, then cached.
 */
export async function buildTermResolver(
  terms: string[],
): Promise<TermVectorResolver> {
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return () => undefined;

  try {
    const vectors = await embeddingService.embedMany(unique);
    const map = new Map<string, number[]>();
    unique.forEach((term, index) => map.set(term.toLowerCase(), vectors[index]));
    return (term: string) => map.get(term.trim().toLowerCase());
  } catch {
    // Explanations fall back to lexical overlap, which is still useful.
    return () => undefined;
  }
}

/**
 * A candidate vector for comparing one specific song against.
 *
 * When the song is already in the playlist, its own embedding is removed from
 * the centroid first. Otherwise the song would be measured partly against
 * itself and every playlist it already belongs to would score near the top.
 */
async function candidateForSong(
  playlist: Playlist,
  songId: string,
): Promise<PlaylistCandidate> {
  if (!playlist.songIds.includes(songId)) return toCandidate(playlist);

  const profiles = await getSongProfiles(playlist.songIds);
  const usable = profiles.filter(
    (profile): profile is SongProfile & { semanticEmbedding: number[] } =>
      Array.isArray(profile.semanticEmbedding) && profile.semanticEmbedding.length > 0,
  );
  const index = usable.findIndex((profile) => profile.songId === songId);

  if (index === -1) return toCandidate(playlist);

  const centroidWithout = calculateLeaveOneOutCentroid(
    usable.map((profile) => profile.semanticEmbedding),
    index,
  );

  const { vector } = calculatePlaylistVector({
    keywordEmbedding: playlist.keywordEmbedding,
    songEmbeddings: centroidWithout.length ? [centroidWithout] : [],
  });

  return {
    playlistId: playlist.id,
    vector,
    terms: playlistTerms(playlist),
  };
}

export interface MatchOutcome {
  matches: PlaylistMatch[];
  /** True when no playlist had a usable vector, so nothing could be ranked. */
  empty: boolean;
}

export async function matchSongToPlaylists(
  profile: SongProfile,
  playlists: Playlist[],
): Promise<MatchOutcome> {
  const songVector = profile.semanticEmbedding ?? [];
  const candidates = (
    await Promise.all(
      playlists.map((playlist) => candidateForSong(playlist, profile.songId)),
    )
  ).filter((candidate) => candidate.vector.length > 0);

  if (songVector.length === 0 || candidates.length === 0) {
    return { matches: [], empty: true };
  }

  const songTerms = activeProfileTerms(profile);
  const resolver = await buildTermResolver([
    ...songTerms,
    ...candidates.flatMap((c) => c.terms),
  ]);

  return {
    matches: rankPlaylists(songVector, songTerms, candidates, resolver),
    empty: false,
  };
}
