import { MATCHING_CONFIG } from '../../config/matching';
import type { PlaylistWeighting } from '../../types';
import { COMPONENT_ORDER, type ComponentName } from './components';

/**
 * Learns how much each part of a match should count for one playlist.
 *
 * No labels are needed: a playlist's own songs are the examples. For every
 * component, compare how its members score (each with itself left out) to how
 * the rest of the library scores. The gap, the lift, is how well that
 * component tells this playlist's songs apart from everything else.
 *
 * A component with a large lift is what defines the playlist, so it gains
 * weight; one where members score no better than strangers is noise for this
 * playlist, so it loses weight. Factors are relative to the playlist's own
 * average lift, so a playlist that is distinct on everything is not boosted
 * across the board.
 *
 * Small playlists are shrunk towards 1: three songs agreeing on a theme is a
 * coincidence as often as it is a pattern.
 */
export function learnWeighting(
  members: Partial<Record<ComponentName, number[]>>,
  others: Partial<Record<ComponentName, number[]>>,
  memberCount: number,
  config = MATCHING_CONFIG.weighting,
): PlaylistWeighting | null {
  if (memberCount < config.minMembers) return null;

  const mean = (values: number[] | undefined) =>
    values && values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

  const lifts: Record<string, number> = {};
  for (const name of COMPONENT_ORDER) {
    const inside = mean(members[name]);
    const outside = mean(others[name]);
    if (inside === null || outside === null) continue;
    if ((others[name]?.length ?? 0) < config.minOthers) continue;
    lifts[name] = inside - outside;
  }

  const measured = Object.values(lifts);
  if (measured.length === 0) return null;

  const factors: Record<string, number> = {};
  const positive = measured.map((lift) => Math.max(0, lift));
  const average = positive.reduce((sum, v) => sum + v, 0) / positive.length;
  const strength = memberCount / (memberCount + config.shrinkage);

  for (const name of COMPONENT_ORDER) {
    const lift = lifts[name];
    if (lift === undefined) continue;
    // Below a point of average lift the playlist is indistinct on every
    // component, and nothing can be learned about which one matters.
    const raw = average < 1 ? 1 : Math.max(0, lift) / average;
    const shrunk = 1 + strength * (raw - 1);
    factors[name] =
      Math.round(Math.min(config.maxFactor, Math.max(config.minFactor, shrunk)) * 100) / 100;
  }

  return {
    factors,
    lifts: Object.fromEntries(
      Object.entries(lifts).map(([name, lift]) => [name, Math.round(lift * 10) / 10]),
    ),
    members: memberCount,
    measuredAt: Date.now(),
  };
}
