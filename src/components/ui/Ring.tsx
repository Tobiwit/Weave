import { useId } from 'react';
import './ui.css';

interface RingProps {
  /** 0-100. */
  value: number;
  size?: number;
  /** Stroke width in px. */
  thickness?: number;
  /** Text inside. Defaults to the rounded value. */
  label?: string;
  unit?: string;
  /** Size of the numeral relative to the ring. */
  fontScale?: number;
  /** Fill colour; the default runs the glow ramp along the arc. */
  color?: string;
  ariaLabel?: string;
}

/**
 * A thin progress ring around a serif numeral.
 *
 * The ring is the score's shape, not decoration: its arc is the score. The
 * stroke runs cyan to lime along its length, so a full ring reads as fully
 * lit and a short one never reaches the bright end.
 */
export function Ring({
  value,
  size = 72,
  thickness = 3,
  label,
  unit = '%',
  fontScale = 0.36,
  color,
  ariaLabel,
}: RingProps) {
  const id = useId().replace(/:/g, '');
  const clamped = Math.max(0, Math.min(100, value));
  const r = 50 - (thickness / size) * 50 - 1;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const strokeWidth = (thickness / size) * 100;

  return (
    <span
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped)}${unit}`}
    >
      <svg className="ring__svg" viewBox="0 0 100 100" aria-hidden="true">
        {!color && (
          <defs>
            <linearGradient id={`ring-${id}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--c-cyan)" />
              <stop offset="55%" stopColor="var(--c-mint)" />
              <stop offset="100%" stopColor="var(--c-citron)" />
            </linearGradient>
          </defs>
        )}
        <circle className="ring__track" cx="50" cy="50" r={r} fill="none" strokeWidth={strokeWidth} />
        <circle
          className="ring__value"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color ?? `url(#ring-${id})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="ring__label" style={{ fontSize: size * fontScale }} aria-hidden="true">
        {label ?? Math.round(clamped)}
        {unit && <span className="ring__unit">{unit}</span>}
      </span>
    </span>
  );
}
