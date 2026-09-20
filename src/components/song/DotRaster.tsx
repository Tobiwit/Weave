import { useId, useMemo, type CSSProperties } from 'react';
import { axisWord, type Axis } from '../../features/song/axes';
import './song.css';

interface DotRasterProps {
  axis: Axis;
  /** Undefined until somebody places this scale. */
  value: number | undefined;
  onChange: (value: number) => void;
  /** Puts the scale back to unplaced. Only offered once there is something to undo. */
  onClear: () => void;
  /** Whether the control can be reached, which follows its group. */
  open: boolean;
  showValue: boolean;
}

/*
 * Twenty-five stops is finer than anyone can honestly judge a song to, and
 * coarse enough that every stop is a dot you can see and aim at.
 */
const STOPS = 25;
const LAST = STOPS - 1;
const ROWS = 3;

/** How far the bulge reaches, as a share of the full scale. */
const REACH = 0.13;
/** Outer rows are quieter, which is what makes the raster read as a swell. */
const ROW_WEIGHT = [0.58, 1, 0.58];

interface Dot {
  key: string;
  /** Position along the scale, 0-1. */
  p: number;
  row: number;
  /** Order of arrival when the raster grows open. */
  order: number;
}

/**
 * A hex-packed field rather than a straight grid: the offset rows are what stop
 * it reading as a ruler.
 */
const DOTS: Dot[] = (() => {
  const dots: Dot[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    const offset = row === 1 ? 0 : 0.5;
    const count = row === 1 ? STOPS : STOPS - 1;
    for (let i = 0; i < count; i += 1) {
      const p = (i + offset) / LAST;
      dots.push({
        key: `${row}-${i}`,
        p,
        row,
        // Arrival spreads outward from the middle of the field.
        order: Math.round(Math.abs(p - 0.5) * LAST),
      });
    }
  }
  return dots;
})();

/**
 * The control for one scale.
 *
 * A field of dots that swells where the value sits, the way the filter strength
 * picker in Photos does. The swell is the readout: no track, no thumb, no
 * number, and the two poles named in the smallest type on the screen. A real
 * range input lies over it at zero opacity, which is what keeps dragging,
 * arrow keys and screen readers working without any of it being reinvented.
 */
export function DotRaster({
  axis,
  value,
  onChange,
  onClear,
  open,
  showValue,
}: DotRasterProps) {
  const id = useId();
  const placed = value !== undefined;
  const at = value ?? 0.5;
  const word = axisWord(axis, value);

  const dots = useMemo(
    () =>
      DOTS.map((dot) => {
        const distance = (dot.p - at) / REACH;
        const swell = Math.exp(-0.5 * distance * distance) * ROW_WEIGHT[dot.row];
        return {
          ...dot,
          scale: 0.5 + 1.9 * swell,
          opacity: (0.1 + 0.9 * swell) * (placed ? 1 : 0.45),
        };
      }),
    [at, placed],
  );

  return (
    <div
      className={`raster${placed ? '' : ' raster--unplaced'}`}
      data-open={open}
      style={{ '--axis': axis.color } as CSSProperties}
    >
      <div className="raster__head">
        <label className="raster__label" htmlFor={id}>
          {axis.label}
        </label>
        <span className="raster__word">
          {word ?? 'Not placed'}
          {showValue && placed && (
            <span className="raster__number">{Math.round(at * 100)}</span>
          )}
          {placed && (
            <button
              type="button"
              className="raster__clear"
              tabIndex={open ? undefined : -1}
              onClick={onClear}
              aria-label={`Unplace ${axis.label}`}
            >
              clear
            </button>
          )}
        </span>
      </div>

      <div className="raster__field">
        <div className="raster__dots" aria-hidden="true">
          {dots.map((dot) => (
            <span
              key={dot.key}
              className="raster__dot"
              style={
                {
                  left: `${dot.p * 100}%`,
                  // Inset from the edges of the field so a dot at full swell
                  // still has room to grow without being clipped.
                  top: `${18 + (dot.row / (ROWS - 1)) * 64}%`,
                  '--dot-scale': dot.scale.toFixed(3),
                  '--dot-opacity': dot.opacity.toFixed(3),
                  '--dot-order': dot.order,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <input
          id={id}
          className="raster__input"
          type="range"
          min={0}
          max={LAST}
          step={1}
          value={Math.round(at * LAST)}
          tabIndex={open ? undefined : -1}
          aria-label={`${axis.label}, from ${axis.low} to ${axis.high}`}
          aria-valuetext={word ?? 'Not placed'}
          onChange={(event) => onChange(Number(event.target.value) / LAST)}
        />
      </div>

      <div className="raster__poles">
        <span>{axis.low}</span>
        <span>{axis.high}</span>
      </div>
    </div>
  );
}
