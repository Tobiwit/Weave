import { getAllPlaylists, getSongs } from '../../db/repositories';
import type { Playlist } from '../../types';
import {
  buildMatchingContext,
  candidateForSong,
} from '../playlists/playlistEngine';
import { calculateSongPlaylistMatch } from './rank';
import type { ComponentName, SongFacets } from './components';

/**
 * A readable breakdown of how songs score against one playlist.
 *
 * Matching is now five separate measurements combined, which is better than
 * one cosine but much harder to argue with when a result looks wrong. This
 * exists so a surprising score can be taken apart: it shows every component
 * for every candidate, so it is obvious whether a song ranked highly because
 * it genuinely fits or because one facet ran away with it.
 *
 * Development tool. Nothing in the interface depends on it, and it is reached
 * from the console rather than from a screen.
 */

export interface EvaluationRow {
  songId: string;
  title: string;
  artist: string;
  /** Whether the song is already in the playlist being evaluated. */
  member: boolean;
  style: number | null;
  moodVibe: number | null;
  themes: number | null;
  tags: number | null;
  playlistSongs: number | null;
  final: number;
}

export interface Evaluation {
  playlistId: string;
  playlist: string;
  /** Songs in the playlist that have been read, out of its total. */
  read: number;
  size: number;
  rows: EvaluationRow[];
}

function scoreOf(
  components: { name: string; score: number | null }[] | undefined,
  name: ComponentName,
): number | null {
  return components?.find((component) => component.name === name)?.score ?? null;
}

/**
 * Scores every read song in the library against one playlist.
 *
 * Members are included and scored with leave-one-out, so a playlist's own
 * songs are a fair baseline: they are what a good match should look like.
 */
export async function evaluatePlaylist(
  playlistOrId: Playlist | string,
  options: { limit?: number } = {},
): Promise<Evaluation> {
  const playlists = await getAllPlaylists();
  const playlist =
    typeof playlistOrId === 'string'
      ? playlists.find((p) => p.id === playlistOrId || p.name === playlistOrId)
      : playlistOrId;

  if (!playlist) throw new Error(`No playlist matching "${String(playlistOrId)}"`);

  const context = await buildMatchingContext(playlists);
  const members = new Set(playlist.songIds);

  const songIds = [...context.facetsBySongId.keys()];
  const songs = await getSongs(songIds);
  const songsById = new Map(songs.map((song) => [song.id, song]));

  const rows: EvaluationRow[] = [];
  for (const songId of songIds) {
    const facets = context.facetsBySongId.get(songId) as SongFacets;
    if (!facets?.whole.length) continue;

    const candidate = candidateForSong(playlist, songId, context);
    const match = calculateSongPlaylistMatch(facets, [], candidate);
    const song = songsById.get(songId);

    rows.push({
      songId,
      title: song?.title ?? songId,
      artist: song?.artist ?? '',
      member: members.has(songId),
      style: scoreOf(match.components, 'style'),
      moodVibe: scoreOf(match.components, 'moodVibe'),
      themes: scoreOf(match.components, 'themes'),
      tags: scoreOf(match.components, 'tags'),
      playlistSongs: scoreOf(match.components, 'playlistSongs'),
      final: match.score,
    });
  }

  rows.sort((a, b) => b.final - a.final);

  return {
    playlistId: playlist.id,
    playlist: playlist.name,
    read: playlist.songIds.filter((id) => context.facetsBySongId.has(id)).length,
    size: playlist.songIds.length,
    rows: options.limit ? rows.slice(0, options.limit) : rows,
  };
}

/** The evaluation as a table, for `console.table` or copying out. */
export function formatEvaluation(evaluation: Evaluation): string {
  const header = [
    'song'.padEnd(34),
    'style'.padStart(6),
    'mood'.padStart(6),
    'theme'.padStart(6),
    'tags'.padStart(6),
    'plSong'.padStart(7),
    'FINAL'.padStart(6),
  ].join(' ');

  const cell = (value: number | null) => (value === null ? '-' : String(value));

  const lines = evaluation.rows.map((row) => {
    const name = `${row.member ? '* ' : '  '}${row.title} - ${row.artist}`;
    return [
      name.slice(0, 34).padEnd(34),
      cell(row.style).padStart(6),
      cell(row.moodVibe).padStart(6),
      cell(row.themes).padStart(6),
      cell(row.tags).padStart(6),
      cell(row.playlistSongs).padStart(7),
      cell(row.final).padStart(6),
    ].join(' ');
  });

  return [
    `${evaluation.playlist} (${evaluation.read}/${evaluation.size} songs read)`,
    '* marks a song already in the playlist, scored leave-one-out',
    header,
    ...lines,
  ].join('\n');
}
