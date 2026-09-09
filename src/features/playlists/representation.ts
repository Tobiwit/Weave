import { MATCHING_CONFIG } from '../../config/matching';
import { PROFILE_EMBEDDING_VERSION } from '../../config/embedding';
import { getSongs } from '../../db/repositories';
import { projectVectors } from '../../services/projection';
import type { Playlist, Song, SongProfile } from '../../types';
import {
  COMPONENT_ORDER,
  cosineSimilarity,
  discriminationWeight,
  type ComponentName,
  type TagCorpus,
} from '../matching';
import { evaluatePlaylist, type EvaluationRow } from '../matching/evaluate';
import { buildMatchingContext, candidateForSong } from './playlistEngine';
import { coreQualities, describeBreadth } from './playlistInsights';

/**
 * Everything a playlist's representation actually consists of, gathered for
 * inspection.
 *
 * Matching is now five separately calibrated components blended together,
 * which behaves better than one cosine and is far harder to argue with. This
 * is the answer to "why did it score that": it reads out the same structures
 * the matcher uses, rather than a prettier summary of them.
 *
 * Nothing here is computed specially for display. Every number comes from the
 * same functions that decide real matches.
 */

export interface ComponentReadout {
  name: ComponentName;
  label: string;
  /** What this facet of the playlist actually says, in its own words. */
  reads: string;
  /** How much it counts towards a match, as language rather than a number. */
  influence: string;
  /** Configured share of a match score, before renormalisation. */
  weight: number;
  available: boolean;
}

/**
 * Whether the scores have run out of room at the top.
 *
 * A calibration band maps a measured similarity range onto 0 to 100. If the
 * ceiling sits below where songs actually land, everything above it clips to
 * 100 and the score stops telling a good fit from a perfect one. Half a
 * playlist reading 100 across every column is not a sign the playlist is
 * excellent. It is a sign the band was measured on a different library.
 */
export interface Saturation {
  atCeiling: number;
  atFloor: number;
  total: number;
  healthy: boolean;
  note: string;
}

export interface VocabularyEntry {
  tag: string;
  /** Songs in the playlist carrying it. */
  count: number;
  /** Rarity weight across every read song in the library. */
  rarity: number;
  /** The weight this tag actually carries: rarity times its share. */
  weight: number;
}

export interface MapPoint {
  songId: string;
  title: string;
  artist: string;
  x: number;
  y: number;
  /** Cosine similarity to the playlist centroid, measured before projection. */
  toCentroid: number;
}

export interface Cohesion {
  /** How much closer a song sits to its nearest companion than to the centre. */
  spread: number;
  label: string;
  description: string;
}

export interface PlaylistRepresentation {
  playlist: Playlist;
  read: number;
  size: number;
  breadth: ReturnType<typeof describeBreadth>;
  coreQualities: string[];
  components: ComponentReadout[];
  vocabulary: VocabularyEntry[];
  members: EvaluationRow[];
  saturation: Saturation | null;
  /** Songs from elsewhere in the library that this playlist pulls hardest on. */
  drawnIn: EvaluationRow[];
  map: MapPoint[];
  cohesion: Cohesion | null;
  /** True when the layout is a fallback ring rather than a real projection. */
  mapIsFallback: boolean;
  vectorVersion?: number;
  embeddingVersion: number;
  updatedAt: number;
}

const COMPONENT_LABELS: Record<ComponentName, string> = {
  playlistSongs: 'Its songs',
  style: 'Style',
  moodVibe: 'Mood and character',
  tags: 'Vocabulary',
  themes: 'Themes',
};

/** The weight as language. A reader wants the shape, not two decimal places. */
function describeInfluence(weight: number): string {
  if (weight >= 0.35) return 'Counts for more than any other part of a match';
  if (weight >= 0.22) return 'Counts for about a quarter of a match';
  if (weight >= 0.15) return 'Counts for about a fifth of a match';
  if (weight >= 0.08) return 'Counts for a tenth of a match';
  return 'Counts for a little, enough to break a tie';
}

/** The commonest few of something, most distinctive first. */
function topTerms(
  profiles: SongProfile[],
  pick: (profile: SongProfile) => string[],
  corpus: TagCorpus,
  limit = 4,
): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const profile of profiles) {
    for (const term of new Set(pick(profile).map((value) => value.trim()))) {
      if (!term) continue;
      const key = term.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: term, count: 1 });
    }
  }
  return [...counts.entries()]
    .map(([key, { label, count }]) => ({
      label,
      score: count * discriminationWeight(key, corpus),
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((entry) => entry.label);
}

function sentence(terms: string[], empty: string): string {
  if (terms.length === 0) return empty;
  if (terms.length === 1) return terms[0];
  return `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]}`;
}

/**
 * Reads how much of the score range is actually being used.
 *
 * Counted over every song in the library scored against this playlist, not
 * just its members. Members are the best-fitting songs by construction and
 * belong at the top of the range, so judging saturation from them alone
 * reports a healthy scale as a broken one. What matters is whether the scale
 * separates the whole field.
 */
export function measureSaturation(rows: EvaluationRow[]): Saturation | null {
  const values: (number | null)[] = rows.flatMap((row) => [
    row.style,
    row.moodVibe,
    row.themes,
    row.tags,
    row.playlistSongs,
  ]);
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 8) return null;

  const atCeiling = present.filter((value) => value === 100).length;
  const atFloor = present.filter((value) => value === 0).length;
  const total = present.length;
  const healthy = (atCeiling + atFloor) / total < 0.25;

  const note = healthy
    ? 'Scores use the range they are given, so they can tell a close fit from a perfect one.'
    : atCeiling >= atFloor
      ? 'Many of these readings are pinned at 100. That means the scale has run out of room, not that the songs are flawless: above the ceiling everything reads the same. The bands were measured on a library smaller than yours, and recalculating remeasures them against your own songs.'
      : 'Many of these readings are pinned at 0, so the scale is bottoming out and cannot separate a poor fit from a hopeless one. Recalculating remeasures the bands against your own songs.';

  return { atCeiling, atFloor, total, healthy, note };
}

/**
 * How clustered a playlist is.
 *
 * On average, how much closer a song sits to its nearest companion than to the
 * playlist's centre. A playlist with one centre scores near zero. A playlist
 * holding two distinct sounds scores high, because its centroid falls in the
 * empty space between them and no song is near it. That gap is exactly the
 * case the nearest-neighbour half of the matching component exists to handle,
 * so it is worth naming rather than hiding.
 *
 * Each song's contribution is floored at zero. A song closer to the middle
 * than to any single neighbour is ordinary and says nothing about clustering,
 * and letting it contribute a negative would be worse than saying nothing: one
 * distant outlier sits far from everything, and its large negative would
 * otherwise cancel real evidence elsewhere and report a split playlist as a
 * tight one.
 */
export function measureCohesion(
  vectors: number[][],
  centroidVector: number[] | undefined,
): Cohesion | null {
  const usable = vectors.filter((vector) => vector.length > 0);
  if (usable.length < 3 || !centroidVector?.length) return null;

  let total = 0;
  for (let i = 0; i < usable.length; i += 1) {
    let nearest = -1;
    for (let j = 0; j < usable.length; j += 1) {
      if (i === j) continue;
      nearest = Math.max(nearest, cosineSimilarity(usable[i], usable[j]));
    }
    total += Math.max(0, nearest - cosineSimilarity(usable[i], centroidVector));
  }

  const spread = total / usable.length;

  if (spread < 0.04) {
    return {
      spread,
      label: 'One centre',
      description:
        'Every song sits about as close to the middle as it does to its neighbours, so the centroid describes this playlist well.',
    };
  }
  if (spread < 0.1) {
    return {
      spread,
      label: 'Loosely grouped',
      description:
        'Songs sit a little closer to each other than to the middle. There are groupings here, but the centre still stands for the whole.',
    };
  }
  return {
    spread,
    label: 'Several clusters',
    description:
      'Songs are much closer to their neighbours than to the middle, so this playlist holds more than one distinct sound. Matching leans on the nearest few songs rather than the centre for exactly this reason.',
  };
}

function vocabularyOf(
  profiles: SongProfile[],
  corpus: TagCorpus,
  limit = 14,
): VocabularyEntry[] {
  const counts = new Map<string, { label: string; count: number }>();
  let songs = 0;

  for (const profile of profiles) {
    const seen = new Set<string>();
    for (const raw of profile.communityTags) {
      const key = raw.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: raw.trim(), count: 1 });
    }
    if (seen.size > 0) songs += 1;
  }

  if (songs === 0) return [];

  return [...counts.entries()]
    .map(([key, { label, count }]) => {
      const rarity = discriminationWeight(key, corpus);
      return { tag: label, count, rarity, weight: rarity * (count / songs) };
    })
    .sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Gathers the whole representation. One pass over the library. */
export async function buildPlaylistRepresentation(
  playlist: Playlist,
  allPlaylists: Playlist[],
): Promise<PlaylistRepresentation> {
  const context = await buildMatchingContext(allPlaylists);
  const evaluation = await evaluatePlaylist(playlist);

  const memberIds = new Set(playlist.songIds);
  const members = evaluation.rows.filter((row) => memberIds.has(row.songId));
  const drawnIn = evaluation.rows.filter((row) => !memberIds.has(row.songId)).slice(0, 5);

  const profiles = playlist.songIds
    .map((songId) => context.profilesById.get(songId))
    .filter((profile): profile is SongProfile => Boolean(profile));

  // The facets any song would be scored against, with nothing excluded.
  const facets = candidateForSong(playlist, '', context).facets;

  const vocabulary = vocabularyOf(profiles, context.corpus);

  const years = profiles
    .map((profile) => context.songsById.get(profile.songId)?.year)
    .filter((year): year is number => typeof year === 'number');
  const era =
    years.length === 0
      ? ''
      : Math.min(...years) === Math.max(...years)
        ? `, around ${Math.min(...years)}`
        : `, from ${Math.min(...years)} to ${Math.max(...years)}`;

  const read = profiles.filter((profile) => profile.semanticEmbedding?.length);

  const reads: Record<ComponentName, string> = {
    playlistSongs:
      read.length > 0
        ? `${read.length} read ${read.length === 1 ? 'song' : 'songs'}, judged both as a whole and by whichever few sit closest to what is being matched.`
        : 'No songs read yet, so a match rests entirely on the words you wrote.',
    style: `${sentence(topTerms(profiles, (p) => p.genres, context.corpus), 'Nothing read yet')}${era}.`,
    moodVibe: `${sentence(
      topTerms(
        profiles,
        (p) => [...(p.mood ? [p.mood] : []), ...p.vibes],
        context.corpus,
      ),
      'Nothing read yet',
    )}.`,
    themes: `${sentence(topTerms(profiles, (p) => p.themes, context.corpus), 'Nothing read yet')}.`,
    tags: `${sentence(
      vocabulary.slice(0, 4).map((entry) => entry.tag),
      'No community tags yet',
    )}.`,
  };

  const components: ComponentReadout[] = COMPONENT_ORDER.map((name) => {
    const available =
      name === 'playlistSongs'
        ? (facets?.whole.length ?? 0) > 0
        : name === 'tags'
          ? (facets?.tags.size ?? 0) > 0
          : (facets?.[name].length ?? 0) > 0;

    return {
      name,
      label: COMPONENT_LABELS[name],
      reads: reads[name],
      influence: describeInfluence(MATCHING_CONFIG.components.weights[name]),
      weight: MATCHING_CONFIG.components.weights[name],
      available,
    };
  });

  const withVectors = profiles.filter((p) => p.semanticEmbedding?.length);
  const songs = await getSongs(withVectors.map((p) => p.songId));
  const songsById = new Map<string, Song>(songs.map((song) => [song.id, song]));

  const vectors = withVectors.map((p) => p.semanticEmbedding as number[]);
  const projected = vectors.length ? await projectVectors(vectors) : [];

  const map: MapPoint[] = withVectors.map((profile, index) => {
    const song = songsById.get(profile.songId);
    const [x, y] = projected[index] ?? [0, 0];
    return {
      songId: profile.songId,
      title: song?.title ?? profile.songId,
      artist: song?.artist ?? '',
      x,
      y,
      toCentroid: playlist.centroidEmbedding?.length
        ? cosineSimilarity(
            profile.semanticEmbedding as number[],
            playlist.centroidEmbedding,
          )
        : 0,
    };
  });

  return {
    playlist,
    read: withVectors.length,
    size: playlist.songIds.length,
    breadth: describeBreadth(profiles, playlist.centroidEmbedding),
    coreQualities: coreQualities(profiles, context.corpus),
    components,
    vocabulary,
    members,
    saturation: measureSaturation(evaluation.rows),
    drawnIn,
    map,
    cohesion: measureCohesion(vectors, playlist.centroidEmbedding),
    // Below four points the projection has nothing to learn and lays out a ring.
    mapIsFallback: vectors.length > 0 && vectors.length < 4,
    vectorVersion: playlist.vectorVersion,
    embeddingVersion: PROFILE_EMBEDDING_VERSION,
    updatedAt: playlist.updatedAt,
  };
}
