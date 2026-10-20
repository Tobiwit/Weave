import type { Playlist } from '../../types';
import { calculateSongPlaylistMatch } from '../matching';
import { buildMatchingContext, candidateForSong } from './playlistEngine';

export interface PlaylistRelationScore {
  playlistId: string;
  /** Mean calibrated match score of this playlist's songs in the other, 0-100. */
  score: number;
  /** Songs the mean was taken over. */
  songs: number;
}

/**
 * How close another playlist is, measured song by song.
 *
 * Comparing two whole-playlist vectors does not work: every playlist is
 * described by the same sentence model in the same vocabulary, so their
 * centres all sit within a few hundredths of each other, and the larger a
 * playlist grows the closer its centre drifts to the average of everything.
 * On a real library every pair scored 100.
 *
 * So the question is asked the way matching asks it: how well would this
 * playlist's songs fit in the other one? Each read song is scored against the
 * other playlist with the full calibrated matcher (the song taken out of it if
 * it is in both), and the scores are averaged. It is not symmetric, and should
 * not be: a small focused playlist can sit entirely inside a broad one without
 * the broad one fitting inside it.
 */
export async function relatedPlaylists(
  playlist: Playlist,
  library: Playlist[],
  limit = 3,
): Promise<PlaylistRelationScore[]> {
  const others = library.filter((entry) => entry.id !== playlist.id);
  if (others.length === 0) return [];

  const context = await buildMatchingContext(library);
  const songIds = playlist.songIds.filter((id) => context.facetsBySongId.get(id)?.whole.length);
  if (songIds.length === 0) return [];

  const out: PlaylistRelationScore[] = [];
  for (const other of others) {
    // One candidate for the playlist as a whole; a song that also belongs to
    // the other playlist gets one built without itself, so it is not
    // measured against its own contribution.
    const shared = candidateForSong(other, '', context);
    const members = new Set(other.songIds);

    let total = 0;
    for (const songId of songIds) {
      const facets = context.facetsBySongId.get(songId);
      if (!facets) continue;
      const candidate = members.has(songId) ? candidateForSong(other, songId, context) : shared;
      total += calculateSongPlaylistMatch(facets, [], candidate).score;
    }
    out.push({
      playlistId: other.id,
      score: Math.round(total / songIds.length),
      songs: songIds.length,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
