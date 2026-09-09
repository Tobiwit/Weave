import { getAllPlaylists, readSetting, writeSetting } from '../../db/repositories';
import type { Playlist } from '../../types';
import {
  bandsFromSamples,
  CALIBRATION_KEY,
  cosineSimilarity,
  playlistSongSimilarity,
  setMeasuredCalibration,
  tagSimilarity,
  type ComponentName,
  type MeasuredCalibration,
} from '../matching';
import { buildMatchingContext, candidateForSong } from './playlistEngine';

/**
 * Measures this library's own score bands.
 *
 * Every read song is scored against every playlist, with the song taken out of
 * any playlist it belongs to, and the raw similarity of each component
 * collected. The spread of those numbers is what the 0-100 scale should be
 * built on: a band measured somewhere else will either clip at the top or
 * bunch at the bottom, and either way the score stops discriminating.
 *
 * Cost is one pass over the library with no network and no new embeddings, so
 * it is cheap enough to run whenever the library is rebuilt.
 */
export async function measureLibraryCalibration(
  playlists?: Playlist[],
): Promise<MeasuredCalibration | null> {
  const all = playlists ?? (await getAllPlaylists());
  if (all.length === 0) return null;

  const context = await buildMatchingContext(all);

  const samples: Record<ComponentName, number[]> = {
    playlistSongs: [],
    style: [],
    moodVibe: [],
    tags: [],
    themes: [],
  };

  let pairs = 0;

  for (const playlist of all) {
    for (const [songId, song] of context.facetsBySongId) {
      if (!song.whole.length) continue;
      const facets = candidateForSong(playlist, songId, context).facets;
      if (!facets) continue;

      pairs += 1;

      const playlistSongs = playlistSongSimilarity(
        song.whole,
        facets.whole,
        facets.songVectors,
      );
      if (playlistSongs !== null) samples.playlistSongs.push(playlistSongs);

      if (song.style.length && facets.style.length) {
        samples.style.push(cosineSimilarity(song.style, facets.style));
      }
      if (song.moodVibe.length && facets.moodVibe.length) {
        samples.moodVibe.push(cosineSimilarity(song.moodVibe, facets.moodVibe));
      }
      if (song.themes.length && facets.themes.length) {
        samples.themes.push(cosineSimilarity(song.themes, facets.themes));
      }
      if (song.tags.size && facets.tags.size) {
        samples.tags.push(tagSimilarity(song.tags, facets.tags));
      }
    }
  }

  if (pairs === 0) return null;

  return {
    bands: bandsFromSamples(samples),
    samples: pairs,
    measuredAt: Date.now(),
  };
}

/** Measures, stores and puts the new bands in force. */
export async function recalibrateLibrary(
  playlists?: Playlist[],
): Promise<MeasuredCalibration | null> {
  const result = await measureLibraryCalibration(playlists);
  if (!result) return null;
  setMeasuredCalibration(result);
  await writeSetting(CALIBRATION_KEY, result).catch(() => undefined);
  return result;
}

/**
 * Puts a previously measured calibration back in force.
 *
 * Called once during boot. Without it every session would fall back to the
 * shipped defaults and scores would change under the user between visits.
 */
export async function loadMeasuredCalibration(): Promise<void> {
  const stored = await readSetting<MeasuredCalibration | null>(
    CALIBRATION_KEY,
    null,
  ).catch(() => null);
  if (stored?.bands) setMeasuredCalibration(stored);
}
