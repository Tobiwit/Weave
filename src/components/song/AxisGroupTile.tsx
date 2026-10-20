import { useMemo, type CSSProperties } from 'react';
import { axisWord, type AxisGroup, type AxisValues } from '../../features/song/axes';
import './song.css';

interface AxisGroupTileProps {
  group: AxisGroup;
  values: AxisValues;
  suggestions?: AxisValues;
  /** This group's full pad is open below. */
  active?: boolean;
  onOpen: () => void;
}

/*
 * A wide, short field: the tiles sit two by two with everything else on the
 * screen, so height is the scarce dimension. Kept in step with `aspect-ratio`
 * on `.atile__field`, which is what keeps the swell round.
 */
const COLS = 13;
const ROWS = 4;
const ASPECT = 13 / 4;
const REACH = 0.36;

/**
 * One group of two scales, small enough to see all four at a glance.
 *
 * A coarse dot field with the same swell the full pad uses, so where the song
 * sits reads at once, and the two words underneath, large. Not a control:
 * tapping it opens the full pad, where placing happens.
 */
export function AxisGroupTile({
  group,
  values,
  suggestions = {},
  active = false,
  onOpen,
}: AxisGroupTileProps) {
  const [x, y] = group.axes;
  const placed = values[x.id] !== undefined || values[y.id] !== undefined;
  const vx = values[x.id] ?? suggestions[x.id] ?? 0.5;
  const vy = values[y.id] ?? suggestions[y.id] ?? 0.5;
  const hasSuggestion = suggestions[x.id] !== undefined || suggestions[y.id] !== undefined;

  const dots = useMemo(() => {
    const out: { key: string; px: number; py: number; scale: number; opacity: number }[] = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const px = col / (COLS - 1);
        const py = row / (ROWS - 1);
        const swell = Math.exp(-0.5 * (Math.hypot((px - vx) * ASPECT, py - vy) / REACH) ** 2);
        out.push({
          key: `${row}-${col}`,
          px,
          py,
          scale: 0.55 + 1.9 * swell,
          opacity: (0.18 + 0.82 * swell) * (placed ? 1 : hasSuggestion ? 0.75 : 0.45),
        });
      }
    }
    return out;
  }, [vx, vy, placed, hasSuggestion]);

  const word = (id: typeof x.id, axis: typeof x) => ({
    text: axisWord(axis, values[id] ?? suggestions[id]),
    suggested: values[id] === undefined && suggestions[id] !== undefined,
  });
  const wx = word(x.id, x);
  const wy = word(y.id, y);

  return (
    <button
      type="button"
      className={`atile${placed ? ' atile--placed' : ''}${active ? ' atile--active' : ''}`}
      aria-expanded={active}
      style={{ '--ax': x.color, '--ay': y.color } as CSSProperties}
      onClick={onOpen}
      aria-label={`${group.label}: ${wx.text ?? 'not placed'}, ${wy.text ?? 'not placed'}. ${active ? 'Close' : 'Open to place'}.`}
    >
      <span className="atile__name">{group.label}</span>
      <span className="atile__field" aria-hidden="true">
        {dots.map((dot) => (
          <span
            key={dot.key}
            className="atile__dot"
            style={
              {
                left: `${dot.px * 100}%`,
                bottom: `${dot.py * 100}%`,
                '--dot-scale': dot.scale.toFixed(3),
                '--dot-opacity': dot.opacity.toFixed(3),
              } as CSSProperties
            }
          />
        ))}
      </span>
      <span className="atile__words">
        <span
          className={`atile__word${wx.suggested ? ' atile__word--suggested' : ''}`}
          style={{ '--axis': x.color } as CSSProperties}
        >
          {wx.text ?? '—'}
        </span>
        <span
          className={`atile__word${wy.suggested ? ' atile__word--suggested' : ''}`}
          style={{ '--axis': y.color } as CSSProperties}
        >
          {wy.text ?? '—'}
        </span>
      </span>
    </button>
  );
}
