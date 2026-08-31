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
 * Missing covers are common offline and across providers, so the fallback is a
 * deterministic woven gradient rather than a grey placeholder: it still gives
 * the song a visual identity.
 */
export function Artwork({
  src,
  seed,
  alt = '',
  size = 56,
  radius,
  className,
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  const hueA = hueFrom(seed, 1);
  const hueB = (hueA + 60 + (hueFrom(seed, 2) % 120)) % 360;
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`art${className ? ` ${className}` : ''}`}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        background: showFallback
          ? `linear-gradient(140deg, hsl(${hueA} 62% 46%), hsl(${hueB} 54% 26%) 62%, hsl(${(hueB + 30) % 360} 40% 14%))`
          : undefined,
      }}
    >
      {showFallback ? (
        <div className="art__fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined} />
      ) : (
        <img
          className="art__img"
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
