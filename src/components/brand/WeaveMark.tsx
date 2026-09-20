interface WeaveMarkProps {
  size?: number;
  /** Unique suffix when several marks share a page. */
  idSuffix?: string;
  className?: string;
}

/**
 * The Weave symbol: a square cut through by interlacing diagonal bands.
 *
 * Was a rounded tile filled with a coral-to-periwinkle gradient, which is the
 * exact shape and colour of every app icon made in the last five years. The
 * weave itself was always the idea, so the fill is gone and the bands are the
 * mark: ruled lines on the ground colour, square, with one band in the signal
 * so it reads as part of the same instrument as the rest of the interface.
 */
export function WeaveMark({ size = 28, idSuffix = 'm', className }: WeaveMarkProps) {
  const clip = `weave-clip-${idSuffix}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Weave"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="2" y="2" width="60" height="60" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect
          x="2"
          y="2"
          width="60"
          height="60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.35"
        />
        {/* One diagonal family, then its counter-family crossing it. */}
        <g stroke="currentColor" strokeWidth="5" opacity="0.9">
          <path d="M-6 26 L26 -6" />
          <path d="M-6 48 L48 -6" />
          <path d="M16 70 L70 16" />
        </g>
        <g stroke="currentColor" strokeWidth="2" opacity="0.45">
          <path d="M-6 58 L58 -6" />
          <path d="M30 70 L70 30" />
        </g>
        {/* The single thread that is not ink. */}
        <path d="M38 70 L70 38" stroke="var(--c-signal)" strokeWidth="5" />
      </g>
    </svg>
  );
}
