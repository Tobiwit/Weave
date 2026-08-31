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

  const hueA = hueFrom(seed, 1);
  const hueB = (hueA + 60 + (hueFrom(seed, 2) % 120)) % 360;
  const dimension = typeof size === 'number' ? `${size}px` : size;
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`art${className ? ` ${className}` : ''}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        background: `linear-gradient(140deg, hsl(${hueA} 62% 46%), hsl(${hueB} 54% 26%) 62%, hsl(${(hueB + 30) % 360} 40% 14%))`,
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
