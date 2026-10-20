import { useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import { axisWord, clamp01, type Axis, type AxisId } from '../../features/song/axes';
import './song.css';

export type AxisPatch = Partial<Record<AxisId, number | undefined>>;

interface AxisPadProps {
  /** The scale running left to right. */
  x: Axis;
  /** The scale running bottom to top. */
  y: Axis;
  xValue: number | undefined;
  yValue: number | undefined;
  onChange: (patch: AxisPatch) => void;
  /** Whether the control can be reached, which follows its group. */
  open: boolean;
  /** Keyboard focus is the only interaction that picks out one of the pair. */
  onHighlight: (id: AxisId | null) => void;
  showValues: boolean;
  /**
   * Where the machine's reading puts each scale. Drawn as a hollow ring, and
   * used as the field's resting point while you have not placed it yourself,
   * so the pad opens on the reading rather than on a blank middle.
   */
  suggestX?: number;
  suggestY?: number;
}

/*
 * Fifteen stops each way is finer than anyone can honestly judge a song to, and
 * coarse enough that every stop is a dot you can see and aim at. The lattice is
 * the stops, so the value always lands exactly on a dot.
 */
const STOPS = 15;
const LAST = STOPS - 1;

/** Kept in step with `aspect-ratio` on `.pad__field`. */
const ASPECT = 4 / 3;
/** How far the swell reaches, in the field's own width-corrected units. */
const REACH = 0.16;

interface Cell {
  key: string;
  /** Position as a value, 0-1. `py` counts upward, like the scale does. */
  px: number;
  py: number;
  /** Order of arrival when the pad grows open, outward from the middle. */
  order: number;
}

const CELLS: Cell[] = (() => {
  const cells: Cell[] = [];
  for (let row = 0; row < STOPS; row += 1) {
    for (let col = 0; col < STOPS; col += 1) {
      const px = col / LAST;
      const py = row / LAST;
      cells.push({
        key: `${row}-${col}`,
        px,
        py,
        order: Math.round(Math.hypot((px - 0.5) * ASPECT, py - 0.5) * LAST),
      });
    }
  }
  return cells;
})();

/**
 * The control for one group: both of its scales at once, as a field.
 *
 * Two scales that belong together are really one judgement, so they get one
 * gesture. The swell in the dot field is the readout — no track, no thumb, no
 * number — and the four pole words at the edges, in each scale's own colour,
 * are the only labels. A pointer places both scales together, which is what a
 * field means; the two sliders underneath are invisible but focusable, so a
 * keyboard can still move one scale on its own, and they are what a screen
 * reader is handed.
 */
export function AxisPad({
  x,
  y,
  xValue,
  yValue,
  onChange,
  open,
  onHighlight,
  showValues,
  suggestX,
  suggestY,
}: AxisPadProps) {
  const placed = xValue !== undefined || yValue !== undefined;
  const suggested = suggestX !== undefined || suggestY !== undefined;
  const vx = xValue ?? suggestX ?? 0.5;
  const vy = yValue ?? suggestY ?? 0.5;

  // The last cell committed, so moving inside one cell is not a write. This is
  // what keeps a drag to a couple of dozen stores rather than one per frame.
  const lastCell = useRef({ col: -1, row: -1 });

  const dots = useMemo(
    () =>
      CELLS.map((cell) => {
        const distance = Math.hypot((cell.px - vx) * ASPECT, cell.py - vy);
        const swell = Math.exp(-0.5 * (distance / REACH) ** 2);
        return {
          ...cell,
          scale: 0.45 + 2 * swell,
          opacity: (0.16 + 0.84 * swell) * (placed ? 1 : suggested ? 0.7 : 0.5),
        };
      }),
    [vx, vy, placed, suggested],
  );

  const commit = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const col = Math.round(clamp01((event.clientX - rect.left) / rect.width) * LAST);
    // The field counts upward; the viewport counts down.
    const row = Math.round(
      clamp01(1 - (event.clientY - rect.top) / rect.height) * LAST,
    );

    if (col === lastCell.current.col && row === lastCell.current.row) return;
    lastCell.current = { col, row };
    onChange({ [x.id]: col / LAST, [y.id]: row / LAST });
  };

  const xWord = axisWord(x, xValue);
  const yWord = axisWord(y, yValue);

  return (
    <div
      className={`pad${placed ? '' : ' pad--unplaced'}${!placed && suggested ? ' pad--suggested' : ''}`}
      data-open={open}
      style={{ '--ax': x.color, '--ay': y.color } as CSSProperties}
    >
      <div className="pad__plot">
        <span className="pad__y pad__y--high">{y.high}</span>
        <span className="pad__y pad__y--low">{y.low}</span>

        <div
          className="pad__field"
          style={
            { '--vx': `${vx * 100}%`, '--vy': `${vy * 100}%` } as CSSProperties
          }
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            // Forget the last cell, so tapping the cell already selected still
            // places a scale that was sitting there only as a default.
            lastCell.current = { col: -1, row: -1 };
            commit(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              commit(event);
            }
          }}
          onPointerUp={(event) =>
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        >
          <div className="pad__dots" aria-hidden="true">
            {dots.map((dot) => (
              <span
                key={dot.key}
                className="pad__dot"
                style={
                  {
                    left: `${dot.px * 100}%`,
                    bottom: `${dot.py * 100}%`,
                    '--dot-scale': dot.scale.toFixed(3),
                    '--dot-opacity': dot.opacity.toFixed(3),
                    '--dot-order': dot.order,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          {suggested && (
            <span
              className="pad__ghost"
              aria-hidden="true"
              style={
                {
                  '--gx': (suggestX ?? 0.5).toFixed(3),
                  '--gy': (suggestY ?? 0.5).toFixed(3),
                } as CSSProperties
              }
            />
          )}

          {placed && (
            /* Inset to match the dot field exactly, so the guides meet the dot
               they point at rather than the edge of the element. */
            <div className="pad__guides" aria-hidden="true">
              <span className="pad__guide pad__guide--x" />
              <span className="pad__guide pad__guide--y" />
            </div>
          )}
        </div>

        {placed && (
          <div className="pad__aside">
            {showValues && (
              <span className="pad__numbers">
                <span className="pad__number pad__number--x">
                  {Math.round(vx * 100)}
                </span>
                <span className="pad__number pad__number--y">
                  {Math.round(vy * 100)}
                </span>
              </span>
            )}
            <button
              type="button"
              className="pad__clear"
              onClick={() => onChange({ [x.id]: undefined, [y.id]: undefined })}
              aria-label={`Unplace ${x.label} and ${y.label}`}
            >
              clear
            </button>
          </div>
        )}
      </div>

      <div className="pad__x">
        <span>{x.low}</span>
        <span>{x.high}</span>
      </div>

      {/*
        Off screen but reachable: arrow keys move one scale without the other,
        which a pointer on a field cannot do, and this is what carries the
        labels and values a screen reader reads.
      */}
      <input
        className="u-sr pad__key pad__key--x"
        type="range"
        min={0}
        max={LAST}
        step={1}
        value={Math.round(vx * LAST)}
        aria-label={`${x.label}, from ${x.low} to ${x.high}`}
        aria-valuetext={xWord ?? 'Not placed'}
        onFocus={() => onHighlight(x.id)}
        onBlur={() => onHighlight(null)}
        onChange={(event) => onChange({ [x.id]: Number(event.target.value) / LAST })}
      />
      <input
        className="u-sr pad__key pad__key--y"
        type="range"
        min={0}
        max={LAST}
        step={1}
        value={Math.round(vy * LAST)}
        aria-label={`${y.label}, from ${y.low} to ${y.high}`}
        aria-valuetext={yWord ?? 'Not placed'}
        onFocus={() => onHighlight(y.id)}
        onBlur={() => onHighlight(null)}
        onChange={(event) => onChange({ [y.id]: Number(event.target.value) / LAST })}
      />
    </div>
  );
}
