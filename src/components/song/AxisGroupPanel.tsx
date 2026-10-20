import type { CSSProperties } from 'react';
import {
  axisWord,
  type Axis,
  type AxisGroup,
  type AxisId,
  type AxisValues,
} from '../../features/song/axes';
import { AxisPad, type AxisPatch } from './AxisPad';
import './song.css';

interface AxisGroupPanelProps {
  group: AxisGroup;
  values: AxisValues;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: AxisPatch) => void;
  /** Reading one strand in the chart lights its scale down here too. */
  highlighted: AxisId | null;
  onHighlight: (id: AxisId | null) => void;
  showValues: boolean;
  /** The machine's reading of these scales, shown where you have not placed them. */
  suggestions?: AxisValues;
}

/**
 * One group of two scales.
 *
 * Shut, it is a line of prose: the group's name and the words its scales
 * currently amount to, each in that scale's colour, in the order they run
 * across and up the field. Open, the words stay put and the field grows
 * underneath them, so expanding adds detail rather than replacing the summary
 * with a form.
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
  suggestions = {},
}: AxisGroupPanelProps) {
  const [x, y] = group.axes;
  const lit = highlighted === x.id || highlighted === y.id;

  return (
    <section
      className={`agroup${open ? ' agroup--open' : ''}${lit ? ' agroup--lit' : ''}`}
    >
      <button
        type="button"
        className="agroup__head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="agroup__name">{group.label}</span>
        <span className="agroup__summary">
          <Word axis={x} word={axisWord(x, values[x.id])} suggested={axisWord(x, suggestions[x.id])} first />
          <Word axis={y} word={axisWord(y, values[y.id])} suggested={axisWord(y, suggestions[y.id])} />
        </span>
      </button>

      <div className="agroup__body" inert={!open}>
        <div className="agroup__inner">
          <AxisPad
            x={x}
            y={y}
            xValue={values[x.id]}
            yValue={values[y.id]}
            open={open}
            showValues={showValues}
            onChange={onChange}
            onHighlight={onHighlight}
            suggestX={suggestions[x.id]}
            suggestY={suggestions[y.id]}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * A scale's current word, carrying its colour. An unplaced scale shows the
 * reading's word, set apart as a suggestion; with no reading it says nothing.
 */
function Word({
  axis,
  word,
  suggested,
  first,
}: {
  axis: Axis;
  word?: string;
  suggested?: string;
  first?: boolean;
}) {
  const shown = word ?? suggested;
  return (
    <>
      {!first && (
        <span className="agroup__sep" aria-hidden="true">
          ·
        </span>
      )}
      <span
        className={`agroup__word${shown ? '' : ' agroup__word--empty'}${
          !word && suggested ? ' agroup__word--suggested' : ''
        }`}
        style={{ '--axis': axis.color } as CSSProperties}
      >
        {shown ?? '—'}
      </span>
    </>
  );
}
