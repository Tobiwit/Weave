import { useState } from 'react';
import type { MapPoint } from '../../features/playlists/representation';

/**
 * The playlist's songs, laid out by how alike they are.
 *
 * Position is a projection and is display only: it is there to make groupings
 * visible, not to be measured off. Everything that carries a number, in
 * particular each song's distance from the centre, is computed in the original
 * embedding space and only then drawn.
 *
 * Distance from the marked centre encodes similarity to the centroid, so a
 * song that sits far out on the map but reads as close to the centre is a
 * genuine signal that the playlist has more than one grouping.
 */
export function PlaylistMap({
  points,
  fallback,
}: {
  points: MapPoint[];
  fallback: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  // The projection is already fitted to [-1, 1]; this inset keeps labels and
  // the outermost dots inside the frame.
  const scale = 42;
  const centre = 50;
  const at = (value: number) => centre + value * scale;

  const strongest = Math.max(...points.map((point) => point.toCentroid), 0.0001);
  const selected = points.find((point) => point.songId === active);

  return (
    <figure className="pmap">
      <svg
        className="pmap__svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${points.length} songs positioned by similarity to each other`}
      >
        <defs>
          <radialGradient id="pmap-core">
            <stop offset="0%" stopColor="var(--c-periwinkle)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--c-periwinkle)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={centre} cy={centre} r="30" fill="url(#pmap-core)" />
        <circle
          cx={centre}
          cy={centre}
          r="1.4"
          className="pmap__centre"
        />

        {points.map((point) => (
          <line
            key={`l-${point.songId}`}
            x1={centre}
            y1={centre}
            x2={at(point.x)}
            y2={at(point.y)}
            className="pmap__thread"
            style={{ opacity: 0.06 + (point.toCentroid / strongest) * 0.22 }}
          />
        ))}

        {points.map((point) => (
          <circle
            key={point.songId}
            cx={at(point.x)}
            cy={at(point.y)}
            r={active === point.songId ? 3.2 : 2.2}
            className={`pmap__dot${active === point.songId ? ' pmap__dot--on' : ''}`}
            style={{ opacity: 0.45 + (point.toCentroid / strongest) * 0.55 }}
            onMouseEnter={() => setActive(point.songId)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(point.songId)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(active === point.songId ? null : point.songId)}
            tabIndex={0}
            role="button"
            aria-label={`${point.title} by ${point.artist}`}
          />
        ))}
      </svg>

      <figcaption className="pmap__caption">
        {selected ? (
          <>
            <span className="pmap__name">{selected.title}</span>
            <span className="u-meta">
              {selected.artist} · {Math.round(selected.toCentroid * 100) / 100} to
              the centre
            </span>
          </>
        ) : (
          <span className="u-meta">
            {fallback
              ? 'Too few songs to lay out properly, so these sit in a ring. Positions mean nothing until there are four.'
              : 'Position shows which songs resemble each other. Brightness shows how close each sits to the playlist’s centre.'}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
