import { createPlaylist, getSongProfiles, upsertSong } from '../../db/repositories';
import type { ImportedPlaylist } from '../../services/spotify';
import type { Playlist } from '../../types';
import { ensurePlaylistVectors } from './ensureVectors';

/**
 * Turns an imported track list into a Weave playlist.
 *
 * The imported songs are stored as identity only. Their readings are not
 * generated here: analysing hundreds of songs is minutes of work and a lot of
 * network, so it stays an explicit choice the user makes afterwards. Until
 * then the playlist is defined by its words alone, which is a shape the
 * matching engine already handles.
 */
export async function createPlaylistFromImport(
  imported: ImportedPlaylist,
  keywords: string[],
): Promise<Playlist> {
  for (const track of imported.tracks) {
    await upsertSong({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      artworkUrl: track.artworkUrl,
      source: 'spotify',
    });
  }

  const playlist = await createPlaylist({
    name: imported.name,
    description: imported.description || undefined,
    keywords,
    songIds: imported.tracks.map((track) => track.id),
  });

  await ensurePlaylistVectors(playlist).catch(() => undefined);
  return playlist;
}

/** Songs in a playlist that have no reading yet, so nothing shapes its centre. */
export async function unreadSongIds(playlist: Playlist): Promise<string[]> {
  const profiles = await getSongProfiles(playlist.songIds);
  const read = new Set(profiles.map((profile) => profile.songId));
  return playlist.songIds.filter((id) => !read.has(id));
}
