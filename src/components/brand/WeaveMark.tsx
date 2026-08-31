interface WeaveMarkProps {
  size?: number;
  /** Unique suffix when several marks share a page. */
  idSuffix?: string;
  className?: string;
}

/**
 * The Weave symbol: a rounded square cut through by interlacing diagonal
 * bands. Strong silhouette, no fine detail, readable at app-icon size.
 */
export function WeaveMark({ size = 28, idSuffix = 'm', className }: WeaveMarkProps) {
  const gradient = `weave-grad-${idSuffix}`;
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
        <linearGradient id={gradient} x1="4" y1="60" x2="60" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8F7A" />
          <stop offset="0.36" stopColor="#E26BD0" />
          <stop offset="0.7" stopColor="#A97BFF" />
          <stop offset="1" stopColor="#9AA6FF" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="2" y="2" width="60" height="60" rx="17" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${gradient})`} />
        <g stroke="#0B0B12" strokeWidth="6" strokeLinecap="round" opacity="0.92">
          <path d="M-6 26 L26 -6" />
          <path d="M-6 48 L48 -6" />
          <path d="M16 70 L70 16" />
          <path d="M38 70 L70 38" />
        </g>
        <g stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" strokeLinecap="round">
          <path d="M-6 34 L34 -6" />
          <path d="M30 70 L70 30" />
        </g>
      </g>
    </svg>
  );
}
