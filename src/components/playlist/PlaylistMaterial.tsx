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
 * A plate for a playlist that has no cover of its own.
 *
 * Was a coloured gradient built from the playlist's mood hues. Against the
 * rest of the interface a row of those read as five glowing app icons, which
 * is the one thing this page should not look like, and colour was doing work
 * that nothing else on the page was doing.
 *
 * So the same mood values now drive a printed plate instead: a ruled field
 * whose angle, pitch and weight come from the playlist's own character, with a
 * single registration mark. Monochrome, mechanical, and different for every
 * playlist without any of them being colourful. It reads as a specimen rather
 * than as an icon.
 */
export function PlaylistMaterial({
  playlist,
  size = 56,
  radius = '0',
  className,
}: PlaylistMaterialProps) {
  const mood = useMemo(() => moodStateFromPlaylist(playlist), [playlist]);
  const dimension = typeof size === 'number' ? `${size}px` : size;

  // An imported playlist keeps the cover it came with. The generated plate is
  // for playlists made here, which have no artwork of their own.
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

  // Denser rule pitch for a dense playlist, steeper rake for a turbulent one.
  const pitch = 3 + (1 - mood.density) * 7;
  const angle = 8 + mood.curvature * 74;
  const weight = 0.5 + mood.contrast * 1.3;
  const ink = 0.24 + mood.contrast * 0.4;
  // A second field crossing the first, so busier moods moiré against
  // themselves rather than being drawn louder.
  const crossPitch = pitch * (1.4 + mood.turbulence * 1.1);
  const crossAngle = angle - 62 - mood.motion * 30;

  return (
    <div
      className={`pl-material${className ? ` ${className}` : ''}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        ['--rule-angle' as string]: `${angle}deg`,
        ['--rule-pitch' as string]: `${pitch}px`,
        ['--rule-weight' as string]: `${weight}px`,
        ['--rule-ink' as string]: `${ink}`,
        ['--cross-angle' as string]: `${crossAngle}deg`,
        ['--cross-pitch' as string]: `${crossPitch}px`,
        ['--cross-ink' as string]: `${(ink * 0.55).toFixed(3)}`,
        ['--mark' as string]: `${18 + mood.warmth * 44}%`,
      }}
      aria-hidden="true"
    />
  );
}
