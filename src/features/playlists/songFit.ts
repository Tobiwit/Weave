import { getAllPlaylists, getSongProfile } from '../../db/repositories';
import type { Playlist, PlaylistMatch, SongProfile } from '../../types';
import { calculateSongPlaylistMatch } from '../matching';
import { readAxes, type AxisReadings } from '../song/axisReading';
import { buildMatchingContext, candidateForSong } from './playlistEngine';

export interface SongFit {
  profile: SongProfile;
  readings: AxisReadings;
  /** The song scored against this playlist with itself taken out of it. */
  match: PlaylistMatch | null;
}

/**
 * How one song sits in one playlist, for the song sheet.
 *
 * The same structures that decide real matches, read for a single pair: the
 * song is left out of the playlist first, so it is not measured partly
 * against itself, exactly as when a new song is matched.
 */
export async function songFitIn(playlist: Playlist, songId: string): Promise<SongFit | null> {
  const profile = await getSongProfile(songId);
  if (!profile) return null;

  const readings = readAxes(profile);
  try {
    const library = await getAllPlaylists();
    const context = await buildMatchingContext(library, [songId]);
    const facets = context.facetsBySongId.get(songId);
    const current = library.find((entry) => entry.id === playlist.id) ?? playlist;
    if (!facets) return { profile, readings, match: null };
    const candidate = candidateForSong(current, songId, context);
    return { profile, readings, match: calculateSongPlaylistMatch(facets, [], candidate) };
  } catch {
    return { profile, readings, match: null };
  }
}
