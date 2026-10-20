import { axisWord, type Axis } from '../../features/song/axes';
import type { AxisOrigin } from '../../features/song/axisReading';
import './axisGauge.css';

interface AxisGaugeProps {
  axis: Axis;
  /** The song's position, 0-1. */
  value: number;
  origin: AxisOrigin;
  /** The band a playlist holds on this scale, when there is one. */
  band?: { from: number; to: number; median: number };
}

const R = 38;
const CX = 50;
const CY = 48;

/** A value on the scale as a point on the upper half circle, low on the left. */
function point(value: number): [number, number] {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, value)));
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const ORIGIN_WORD: Record<AxisOrigin, string> = {
  user: 'yours',
  measured: 'measured',
  inferred: 'from words',
  none: 'unknown',
};

/**
 * One scale as a half circle.
 *
 * The arc runs from the low word on the left to the high word on the right.
 * A playlist's band is the lit stretch of it; the song is the point. A solid
 * point was measured or placed by you; a ring was only read from words.
 */
export function AxisGauge({ axis, value, origin, band }: AxisGaugeProps) {
  const [px, py] = point(value);
  const inside = band ? value >= band.from - 0.001 && value <= band.to + 0.001 : undefined;
  const solid = origin === 'user' || origin === 'measured';
  const word = origin === 'none' ? '—' : axisWord(axis, value);

  return (
    <figure
      className={`gauge${inside === false ? ' gauge--outside' : ''}`}
      aria-label={`${axis.label}: ${word ?? 'unknown'}, ${ORIGIN_WORD[origin]}${
        band ? (inside ? ', inside the playlist' : ', outside the playlist') : ''
      }`}
    >
      <svg className="gauge__svg" viewBox="0 0 100 54" aria-hidden="true">
        <path className="gauge__track" d={arc(0, 1)} />
        {band && <path className="gauge__band" d={arc(band.from, band.to)} />}
        {band && (
          <circle className="gauge__median" cx={point(band.median)[0]} cy={point(band.median)[1]} r="1.6" />
        )}
        {origin !== 'none' && (
          <circle
            className={`gauge__point${solid ? ' gauge__point--solid' : ''}`}
            cx={px}
            cy={py}
            r="4.2"
          />
        )}
      </svg>
      <figcaption className="gauge__caption">
        <span className="gauge__label">{axis.label}</span>
        <span className="gauge__word">{word}</span>
        <span className="gauge__origin">{ORIGIN_WORD[origin]}</span>
      </figcaption>
    </figure>
  );
}
