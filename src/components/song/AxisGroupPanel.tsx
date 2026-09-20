import type { CSSProperties } from 'react';
import {
  axisWord,
  type Axis,
  type AxisGroup,
  type AxisId,
  type AxisValues,
} from '../../features/song/axes';
import { DotRaster } from './DotRaster';
import './song.css';

interface AxisGroupPanelProps {
  group: AxisGroup;
  values: AxisValues;
  open: boolean;
  onToggle: () => void;
  onChange: (id: AxisId, value: number | undefined) => void;
  /** Reading one strand in the chart lights its scale down here too. */
  highlighted: AxisId | null;
  onHighlight: (id: AxisId | null) => void;
  showValues: boolean;
}

/**
 * One group of two scales.
 *
 * Shut, it is a line of prose: the group's name and the words its scales
 * currently amount to, each in that scale's colour. Open, the words stay put
 * and the controls grow underneath them, so expanding adds detail rather than
 * replacing the summary with a form.
 */
export function AxisGroupPanel({
  group,
  values,
  open,
  onToggle,
  onChange,
  highlighted,
  onHighlight,
  showValues,
}: AxisGroupPanelProps) {
  const summary = group.axes.map((axis) => ({
    axis,
    word: axisWord(axis, values[axis.id]),
  }));

  return (
    <section className={`agroup${open ? ' agroup--open' : ''}`}>
      <button
        type="button"
        className="agroup__head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="agroup__name">{group.label}</span>
        <span className="agroup__summary">
          {summary.map(({ axis, word }, index) => (
            <Word key={axis.id} axis={axis} word={word} first={index === 0} />
          ))}
        </span>
      </button>

      <div className="agroup__body" inert={!open}>
        <div className="agroup__inner">
          {group.axes.map((axis) => (
            <div
              key={axis.id}
              className={`agroup__axis${
                highlighted === axis.id ? ' agroup__axis--lit' : ''
              }`}
              onPointerDown={() => onHighlight(axis.id)}
              onFocus={() => onHighlight(axis.id)}
            >
              <DotRaster
                axis={axis}
                value={values[axis.id]}
                open={open}
                showValue={showValues}
                onChange={(value) => onChange(axis.id, value)}
                onClear={() => onChange(axis.id, undefined)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A scale's current word, carrying its colour. Unplaced scales say nothing. */
function Word({ axis, word, first }: { axis: Axis; word?: string; first: boolean }) {
  return (
    <>
      {!first && (
        <span className="agroup__sep" aria-hidden="true">
          ·
        </span>
      )}
      <span
        className={`agroup__word${word ? '' : ' agroup__word--empty'}`}
        style={{ '--axis': axis.color } as CSSProperties}
      >
        {word ?? '—'}
      </span>
    </>
  );
}
