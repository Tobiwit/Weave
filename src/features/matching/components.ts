import { MATCHING_CONFIG } from '../../config/matching';
import { calibrationFor } from './calibration';
import { normalizeSimilarity } from './score';
import { tagSimilarity, type TagVector } from './tagRarity';
import { cosineSimilarity, type Vector } from './vector';

/**
 * Matching as several independent readings rather than one blended vector.
 *
 * A single embedding of a whole reading collapses everything a song is into
 * one direction, and whichever descriptor the model happens to hold most
 * strongly then dominates. A song called feminine would sit near a playlist
 * called feminine no matter how far apart they were in style, era, or what
 * their songs actually sound like.
 *
 * Splitting the comparison fixes that. Style, feeling, subject, vocabulary and
 * the playlist's own songs are each measured separately, each calibrated
 * against its own distribution, and only then combined. One strong facet can
 * lift a score; it can no longer be the score.
 *
 * The weights are configuration, not law. They are the starting point in
 * `MATCHING_CONFIG.components.weights` and are meant to be tuned.
 */

export type ComponentName =
  | 'playlistSongs'
  | 'style'
  | 'moodVibe'
  | 'tags'
  | 'themes';

export const COMPONENT_ORDER: ComponentName[] = [
  'playlistSongs',
  'style',
  'moodVibe',
  'tags',
  'themes',
];

export interface ComponentResult {
  name: ComponentName;
  /** Raw similarity in [0, 1], or null when this facet could not be compared. */
  similarity: number | null;
  /** The calibrated 0-100 reading of that similarity, or null. */
  score: number | null;
  /** Share of the final score this component actually carried. */
  weight: number;
}

export interface MatchBreakdown {
  components: ComponentResult[];
  /** Weighted combination in [0, 1]. What ranking sorts on. */
  combined: number;
  /** The displayed 0-100 Match Score. */
  score: number;
}

/** One song's facet vectors, all built from the canonical facet texts. */
export interface SongFacets {
  whole: Vector;
  style: Vector;
  moodVibe: Vector;
  themes: Vector;
  tags: TagVector;
}

/** What a playlist offers a song to be compared against. */
export interface PlaylistFacets {
  /** The blended playlist vector: its written world plus its songs. */
  whole: Vector;
  /** Vectors of the songs in it, for the nearest-neighbour half. */
  songVectors: Vector[];
  style: Vector;
  moodVibe: Vector;
  themes: Vector;
  tags: TagVector;
}

/**
 * How close a song sits to a playlist's songs.
 *
 * The centroid alone describes a playlist as though it had one centre. Plenty
 * do not: a playlist holding both slow piano ballads and loud club tracks has
 * a centroid sitting in the empty space between them, close to neither, and a
 * song that genuinely belongs to one of the clusters scores badly against it.
 *
 * So the centroid is combined with the mean of the closest few songs, which
 * asks the different question of whether this song has company here. A song
 * that fits one cluster well scores well even when the playlist as a whole is
 * pulled elsewhere.
 */
export function playlistSongSimilarity(
  songVector: Vector,
  playlistVector: Vector,
  songVectors: Vector[],
  config = MATCHING_CONFIG.components.playlistSongs,
): number | null {
  const centroidSimilarity = playlistVector.length
    ? cosineSimilarity(songVector, playlistVector)
    : null;

  const neighbours = songVectors
    .filter((vector) => vector.length > 0)
    .map((vector) => cosineSimilarity(songVector, vector))
    .sort((a, b) => b - a)
    .slice(0, config.topK);

  if (neighbours.length === 0) return centroidSimilarity;

  const nearest =
    neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length;

  if (centroidSimilarity === null) return nearest;
  return (
    centroidSimilarity * config.centroidWeight + nearest * config.nearestWeight
  );
}

/** Cosine of two facet vectors, or null when either side has nothing to say. */
function facetSimilarity(a: Vector, b: Vector): number | null {
  if (!a.length || !b.length) return null;
  return cosineSimilarity(a, b);
}

/**
 * Scores one song against one playlist, facet by facet.
 *
 * A component with nothing to compare is dropped rather than counted as zero,
 * and the remaining weights are renormalised. Scoring an absent signal as a
 * mismatch would punish a playlist for being new, or a song for having no
 * community tags, neither of which is evidence of anything.
 */
export function scoreComponents(
  song: SongFacets,
  playlist: PlaylistFacets,
  weights = MATCHING_CONFIG.components.weights,
): MatchBreakdown {
  const raw: Record<ComponentName, number | null> = {
    playlistSongs: song.whole.length
      ? playlistSongSimilarity(song.whole, playlist.whole, playlist.songVectors)
      : null,
    style: facetSimilarity(song.style, playlist.style),
    moodVibe: facetSimilarity(song.moodVibe, playlist.moodVibe),
    tags:
      song.tags.size && playlist.tags.size
        ? tagSimilarity(song.tags, playlist.tags)
        : null,
    themes: facetSimilarity(song.themes, playlist.themes),
  };

  const available = COMPONENT_ORDER.filter((name) => raw[name] !== null);
  const totalWeight = available.reduce((sum, name) => sum + weights[name], 0);

  const components: ComponentResult[] = COMPONENT_ORDER.map((name) => {
    const similarity = raw[name];
    if (similarity === null) {
      return { name, similarity: null, score: null, weight: 0 };
    }
    return {
      name,
      similarity,
      score: normalizeSimilarity(similarity, calibrationFor(name)),
      weight: totalWeight > 0 ? weights[name] / totalWeight : 0,
    };
  });

  // Each component is calibrated before it is combined. The facets sit in
  // different parts of the similarity range, so averaging the raw cosines
  // would silently weight them by their spread rather than by the weights.
  const combined = components.reduce(
    (sum, component) =>
      component.score === null
        ? sum
        : sum + (component.score / 100) * component.weight,
    0,
  );

  return {
    components,
    combined,
    score: Math.round(Math.min(100, Math.max(0, combined * 100))),
  };
}
