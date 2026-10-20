import { MATCHING_CONFIG } from '../../config/matching';
import type { Playlist } from '../../types';
import { weightedQuantile } from '../matching';
import { ensureLibraryVectors } from '../playlists/ensureVectors';
import { buildMatchingContext } from '../playlists/playlistEngine';
import { AXES, type AxisId } from '../song/axes';
import type { AxisReadings } from '../song/axisReading';

/** Where a playlist sits on one scale: its middle, and the middle half of its songs. */
export interface AxisPosition {
  median: number;
  low: number;
  high: number;
  /** Read songs that placed on this scale. */
  songs: number;
}

export interface PlaylistPosition {
  playlist: Playlist;
  axes: Partial<Record<AxisId, AxisPosition>>;
}

/**
 * A playlist's position on every scale it has anything to say about.
 *
 * The same reading of a playlist matching uses: its songs weighted by how sure
 * each position is, with the playlist's own keywords joining in as a couple of
 * imagined songs. Unlike matching, one song is enough to place it: this is a
 * map, and a playlist with one read song still lives somewhere.
 */
export function positionOf(
  members: AxisReadings[],
  stated: Partial<Record<AxisId, number>> = {},
): Partial<Record<AxisId, AxisPosition>> {
  const out: Partial<Record<AxisId, AxisPosition>> = {};
  for (const { id } of AXES) {
    const observations = members
      .map((reading) => ({ value: reading[id].value, weight: reading[id].confidence }))
      .filter((o) => o.weight > 0);
    const songs = observations.length;
    const said = stated[id];
    if (typeof said === 'number') {
      observations.push({ value: said, weight: MATCHING_CONFIG.axes.keywordPseudoCount * 0.5 });
    }
    if (observations.length === 0) continue;
    out[id] = {
      median: weightedQuantile(observations, 0.5),
      low: weightedQuantile(observations, 0.25),
      high: weightedQuantile(observations, 0.75),
      songs,
    };
  }
  return out;
}

/** Every playlist in the library, placed. */
export async function loadPlaylistPositions(): Promise<PlaylistPosition[]> {
  const library = await ensureLibraryVectors();
  if (library.length === 0) return [];
  const context = await buildMatchingContext(library);

  return library.map((playlist) => {
    const members = playlist.songIds
      .map((id) => context.axesBySongId.get(id))
      .filter((reading): reading is AxisReadings => Boolean(reading));
    return {
      playlist,
      axes: positionOf(members, context.statedAxesByPlaylistId.get(playlist.id)?.axes),
    };
  });
}

export interface LabelPoint {
  id: string;
  x: number;
  y: number;
  name: string;
}

export interface LabelPlacement {
  /** Label sits to the left of its point. */
  flip: boolean;
  /** Vertical nudge, as a share of the field's height (positive is up). */
  dy: number;
}

/**
 * Keeps point labels from sitting on top of each other.
 *
 * Greedy and cheap: labels are placed top to bottom, each trying the right of
 * its point, then the left, then nudging up and down a step at a time until
 * it is clear of every label already placed. Widths are estimated from the
 * name's length; at the scale of a handful of playlists that is plenty.
 */
export function placeLabels(
  points: LabelPoint[],
  { charWidth = 0.022, height = 0.06, gap = 0.03 }: { charWidth?: number; height?: number; gap?: number } = {},
): Record<string, LabelPlacement> {
  const boxes: { left: number; right: number; bottom: number; top: number }[] = [];
  const out: Record<string, LabelPlacement> = {};
  const overlaps = (box: (typeof boxes)[number]) =>
    boxes.some((other) => box.left < other.right && box.right > other.left && box.bottom < other.top && box.top > other.bottom);
  // Points too, so a label never covers another playlist's dot.
  for (const point of points) {
    boxes.push({ left: point.x - 0.025, right: point.x + 0.025, bottom: point.y - 0.025, top: point.y + 0.025 });
  }

  const sorted = [...points].sort((a, b) => b.y - a.y);
  for (const point of sorted) {
    const width = 0.05 + point.name.length * charWidth;
    const preferLeft = point.x > 0.66;
    const sides = preferLeft ? [true, false] : [false, true];
    const nudges = [0, 1, -1, 2, -2, 3, -3];
    let chosen: LabelPlacement | null = null;
    let box: (typeof boxes)[number] | null = null;
    search: for (const step of nudges) {
      for (const flip of sides) {
        const dy = step * height;
        const left = flip ? point.x - gap - width : point.x + gap;
        const candidate = { left, right: left + width, bottom: point.y + dy - height / 2, top: point.y + dy + height / 2 };
        // The point's own dot is in the list; ignore it for its own label.
        const own = boxes.findIndex((b) => Math.abs(b.left - (point.x - 0.025)) < 1e-9 && Math.abs(b.bottom - (point.y - 0.025)) < 1e-9);
        const saved = own >= 0 ? boxes.splice(own, 1)[0] : null;
        const clear = !overlaps(candidate);
        if (saved) boxes.splice(own, 0, saved);
        if (clear) {
          chosen = { flip, dy };
          box = candidate;
          break search;
        }
      }
    }
    out[point.id] = chosen ?? { flip: preferLeft, dy: 0 };
    if (box) boxes.push(box);
  }
  return out;
}
