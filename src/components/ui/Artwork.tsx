import { useState } from 'react';
import './ui.css';

interface ArtworkProps {
  src?: string;
  /** Used to generate a stable fallback when there is no cover image. */
  seed: string;
  alt?: string;
  size?: number | string;
  radius?: string;
  className?: string;
}

function hueFrom(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/**
 * Album art with a generated fallback.
 *
 * The generated cover is always painted underneath, so a song has a visual
 * identity immediately. A real cover fades in over it once it loads, which is
 * what makes artwork arriving mid-analysis feel like part of the sequence
 * rather than a layout jump.
 */
export function Artwork({
  src,
  seed,
  alt = '',
  size = 56,
  radius,
  className,
}: ArtworkProps) {
  // One piece of state keyed by the source it describes. A new src therefore
  // reads as unloaded during render, with no effect needed to reset it, so the
  // fade replays instead of one cover snapping over another.
  const [status, setStatus] = useState<{ src: string; ok: boolean } | null>(null);
  const current = status && status.src === src ? status : null;
  const loaded = current?.ok === true;
  const failed = current?.ok === false;

  // Generated covers stay inside the glow ramp, cyan to lime, so a library
  // of songs without art still reads as one family.
  const hueA = 105 + (hueFrom(seed, 1) % 125);
  const hueB = 105 + (hueFrom(seed, 2) % 125);
  const dimension = typeof size === 'number' ? `${size}px` : size;
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`art${className ? ` ${className}` : ''}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        background: `radial-gradient(120% 90% at 30% 100%, oklch(0.72 0.13 ${hueA}), oklch(0.36 0.07 ${hueB}) 60%, oklch(0.2 0.02 ${hueB}))`,
      }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
    >
      <div className="art__fallback" aria-hidden="true" />

      {showImage && (
        <img
          className="art__img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => src && setStatus({ src, ok: true })}
          onError={() => src && setStatus({ src, ok: false })}
        />
      )}
    </div>
  );
}
