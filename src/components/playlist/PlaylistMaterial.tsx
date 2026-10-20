import { useMemo } from 'react';
import { moodStateFromPlaylist } from '../../features/mood/moodVisualState';
import type { Playlist } from '../../types';
import './playlist.css';

interface PlaylistMaterialProps {
  playlist: Playlist;
  size?: number | string;
  radius?: string;
  className?: string;
}

/**
 * A cover for a playlist that has none of its own.
 *
 * Built from the mark's own shape: a few concentric half circles, each set at
 * its own angle. The playlist's character decides how many arcs there are,
 * how far they fan, and where on the glow ramp they sit, so every plate is
 * different and every plate is obviously from the same family.
 */
export function PlaylistMaterial({
  playlist,
  size = 56,
  radius = 'var(--r-sm)',
  className,
}: PlaylistMaterialProps) {
  const mood = useMemo(() => moodStateFromPlaylist(playlist), [playlist]);
  const dimension = typeof size === 'number' ? `${size}px` : size;

  if (playlist.coverUrl) {
    return (
      <img
        className={`pl-material pl-material--art${className ? ` ${className}` : ''}`}
        src={playlist.coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        width={typeof size === 'number' ? size : undefined}
        height={typeof size === 'number' ? size : undefined}
        style={{ width: dimension, height: dimension, borderRadius: radius }}
      />
    );
  }

  // Denser playlists carry more arcs; turbulent ones fan them wider.
  // Mood sets the character; a hash of the id keeps two similar playlists
  // from wearing the same cover.
  const seed = hashUnit(playlist.id);
  const count = 2 + Math.round(mood.density * 2 + seed);
  const fan = 18 + mood.turbulence * 50 + seed * 40;
  const base = mood.curvature * 120 + seed * 240;
  const hue = 214 - mood.warmth * 70 - seed * 40;
  const radii = Array.from({ length: count }, (_, i) => 12 + i * (26 / count));

  return (
    <div
      className={`pl-material${className ? ` ${className}` : ''}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        background: `radial-gradient(120% 100% at 50% 110%, oklch(0.42 0.09 ${hue.toFixed(0)}), oklch(0.2 0.02 ${hue.toFixed(0)}) 70%)`,
      }}
      aria-hidden="true"
    >
      <svg viewBox="-50 -50 100 100" className="pl-material__arcs">
        {radii.map((r, i) => (
          <path
            key={r}
            d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`}
            transform={`rotate(${(base + i * fan).toFixed(1)})`}
            fill="none"
            strokeWidth={5}
            strokeLinecap="round"
            style={{ stroke: `oklch(${0.82 + i * 0.03} ${0.1 + i * 0.02} ${(hue - i * 22).toFixed(0)})` }}
          />
        ))}
      </svg>
    </div>
  );
}

/** A stable number in [0, 1) from a string. */
function hashUnit(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}
