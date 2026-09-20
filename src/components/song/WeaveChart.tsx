import { useId, useMemo, type CSSProperties } from 'react';
import {
  AXES,
  axisValue,
  axisWord,
  isPlaced,
  type AxisId,
  type AxisValues,
} from '../../features/song/axes';
import { strandPath, summitPoint, type StrandGeometry } from '../../features/song/weaveCurve';
import { useGlide } from './useGlide';
import './song.css';

interface WeaveChartProps {
  values: AxisValues;
  /** The strand being read right now, if any. */
  selected: AxisId | null;
  onSelect: (id: AxisId | null) => void;
  /** Numbers are off until somebody asks for them. */
  showValues: boolean;
}

/*
 * The plot, in viewBox units. Positive quadrant only: one upright on the left,
 * one baseline along the bottom, and nothing enclosing them. There is no grid,
 * because a grid invites the eye to measure and these values are not measured.
 */
/*
 * Stop colours as declarations rather than presentation attributes: `var()` is
 * only reliably honoured when it is a real CSS property value.
 */
const INK_42: CSSProperties = { stopColor: 'var(--c-text)', stopOpacity: 0.6 };
const INK_22: CSSProperties = { stopColor: 'var(--c-text)', stopOpacity: 0.34 };
const INK_0: CSSProperties = { stopColor: 'var(--c-text)', stopOpacity: 0 };

const VIEW = { w: 360, h: 216 };
const GEOMETRY: StrandGeometry = { x0: 28, x1: 348, baseline: 196, span: 166 };

/**
 * The Weave.
 *
 * Eight strands over one pair of axes. Each strand crosses the full width and
 * rises to exactly one summit, and the horizontal position of that summit is
 * the value — so the chart is read left to right, like every other chart, and
 * needs no numbers to be read at all. The differing heights are identity only:
 * they let eight overlapping arches stay eight arches.
 *
 * A strand nobody has placed is drawn in ink rather than in its colour, resting
 * at the centre. Colour arrives when a decision does.
 */
export function WeaveChart({ values, selected, onSelect, showValues }: WeaveChartProps) {
  const id = useId().replace(/:/g, '');

  // Glide through changes as one motion, so adjusting a scale feels like
  // pulling a thread rather than redrawing a chart.
  const targets = useMemo(
    () => AXES.map((axis) => axisValue(values, axis.id)),
    [values],
  );
  const shown = useGlide(targets);

  const selectedAxis = selected ? AXES.find((axis) => axis.id === selected) : undefined;
  const selectedIndex = selectedAxis ? AXES.indexOf(selectedAxis) : -1;
  const summit =
    selectedAxis && selectedIndex >= 0
      ? summitPoint(shown[selectedIndex] ?? 0.5, selectedAxis.lift, GEOMETRY)
      : undefined;

  const reading = AXES.map((axis) => {
    const word = axisWord(axis, values[axis.id]);
    return word ? `${axis.label}: ${word}` : undefined;
  })
    .filter(Boolean)
    .join('. ');

  return (
    <div className="weave" onPointerDown={() => onSelect(null)}>
      <svg
        className="weave__svg"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={
          reading ? `The weave. ${reading}.` : 'The weave. Nothing placed yet.'
        }
      >
        {/*
          Gradient stops resolve `currentColor` against the gradient element
          itself, not against whatever references it, so every colour here is
          named outright. The wash is rebuilt for whichever strand is being
          read, which is cheaper than keeping eight of them alive.
        */}
        <defs>
          {/*
            User space, not the object's own box: a perfectly vertical or
            horizontal line has a zero-width bounding box, and a gradient in
            bounding-box units over one of those is degenerate — the line simply
            does not paint.
          */}
          <linearGradient
            id={`${id}-up`}
            gradientUnits="userSpaceOnUse"
            x1={GEOMETRY.x0}
            y1={GEOMETRY.baseline}
            x2={GEOMETRY.x0}
            y2={18}
          >
            <stop offset="0" style={INK_42} />
            <stop offset="1" style={INK_0} />
          </linearGradient>
          <linearGradient
            id={`${id}-across`}
            gradientUnits="userSpaceOnUse"
            x1={GEOMETRY.x0}
            y1={GEOMETRY.baseline}
            x2={VIEW.w}
            y2={GEOMETRY.baseline}
          >
            <stop offset="0" style={INK_42} />
            <stop offset="0.7" style={INK_22} />
            <stop offset="1" style={INK_0} />
          </linearGradient>
          <linearGradient
            id={`${id}-wash`}
            gradientUnits="userSpaceOnUse"
            x1={GEOMETRY.x0}
            y1={18}
            x2={GEOMETRY.x0}
            y2={GEOMETRY.baseline}
          >
            <stop
              offset="0"
              stopColor={selectedAxis?.color ?? 'transparent'}
              stopOpacity="0.22"
            />
            <stop
              offset="1"
              stopColor={selectedAxis?.color ?? 'transparent'}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        <g className="weave__axis" aria-hidden="true">
          <line
            x1={GEOMETRY.x0}
            y1={GEOMETRY.baseline}
            x2={GEOMETRY.x0}
            y2={18}
            stroke={`url(#${id}-up)`}
          />
          <line
            x1={GEOMETRY.x0}
            y1={GEOMETRY.baseline}
            x2={VIEW.w}
            y2={GEOMETRY.baseline}
            stroke={`url(#${id}-across)`}
          />
          <circle cx={GEOMETRY.x0} cy={GEOMETRY.baseline} r="1.6" />
        </g>

        <g className={`weave__strands${selected ? ' weave__strands--focused' : ''}`}>
          {AXES.map((axis, index) => {
            const value = shown[index] ?? 0.5;
            const path = strandPath(value, axis.lift, GEOMETRY);
            const placed = isPlaced(values, axis.id);
            const isSelected = axis.id === selected;

            return (
              <g
                key={axis.id}
                className={[
                  'strand',
                  placed ? 'strand--placed' : 'strand--unplaced',
                  isSelected ? 'strand--on' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ color: axis.color, '--strand-index': index } as CSSProperties}
              >
                {isSelected && (
                  <path
                    className="strand__wash"
                    d={`${path} L${GEOMETRY.x1} ${GEOMETRY.baseline} L${GEOMETRY.x0} ${GEOMETRY.baseline} Z`}
                    fill={`url(#${id}-wash)`}
                  />
                )}
                <path className="strand__line" d={path} />
                <path
                  className="strand__hit"
                  d={path}
                  aria-hidden="true"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(isSelected ? null : axis.id);
                  }}
                />
              </g>
            );
          })}
        </g>

        {selectedAxis && summit && (
          <g
            className="weave__summit"
            style={{ color: selectedAxis.color }}
            aria-hidden="true"
          >
            <line
              x1={summit.x}
              y1={summit.y}
              x2={summit.x}
              y2={GEOMETRY.baseline}
              className="weave__drop"
            />
            <circle cx={summit.x} cy={summit.y} r="3.2" className="weave__dot" />
          </g>
        )}
      </svg>

      {/* The poles belong to whichever strand is being read, so they only exist
          while one is. Printing eight pairs at once would be a legend. */}
      <div className={`weave__poles${selectedAxis ? ' weave__poles--on' : ''}`}>
        <span>{selectedAxis?.low}</span>
        <span className="weave__now" style={{ color: selectedAxis?.color }}>
          {selectedAxis && (
            <>
              {axisWord(selectedAxis, values[selectedAxis.id]) ?? 'Unplaced'}
              {showValues && values[selectedAxis.id] !== undefined && (
                <span className="weave__number">
                  {Math.round((values[selectedAxis.id] as number) * 100)}
                </span>
              )}
            </>
          )}
        </span>
        <span>{selectedAxis?.high}</span>
      </div>
    </div>
  );
}
