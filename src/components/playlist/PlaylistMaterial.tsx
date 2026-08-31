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
 * A small mood material derived from the playlist's own descriptors.
 *
 * Pure CSS so a list of these costs nothing: the full canvas field is reserved
 * for the page background.
 */
export function PlaylistMaterial({
  playlist,
  size = 56,
  radius = 'var(--r-md)',
  className,
}: PlaylistMaterialProps) {
  const mood = useMemo(() => moodStateFromPlaylist(playlist), [playlist]);
  const dimension = typeof size === 'number' ? `${size}px` : size;

  const bandGap = 6 + (1 - mood.density) * 10;
  const bandAngle = 96 + mood.curvature * 46;

  return (
    <div
      className={`pl-material${className ? ` ${className}` : ''}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        background: `
          radial-gradient(120% 100% at 24% 18%, hsl(${mood.hueA} ${
            46 + mood.warmth * 26
          }% ${34 + mood.contrast * 22}%), transparent 68%),
          linear-gradient(150deg, hsl(${mood.hueA} 44% 20%), hsl(${mood.hueB} ${
            42 + mood.warmth * 22
          }% ${16 + mood.contrast * 16}%))`,
        ['--band-gap' as string]: `${bandGap}px`,
        ['--band-angle' as string]: `${bandAngle}deg`,
        ['--band-opacity' as string]: `${0.08 + mood.contrast * 0.16}`,
        ['--material-blur' as string]: `${1 + mood.softness * 3}px`,
      }}
      aria-hidden="true"
    />
  );
}
