import { useId } from 'react';
import './ui.css';

interface SliderProps {
  label: string;
  /** What the dimension actually means, in plain words. */
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  /** Words along the scale, low to high. The active one is shown. */
  scale: readonly string[];
  /** Shown when the value came from a provider rather than from our reading. */
  measured?: boolean;
}

function wordFor(value: number, scale: readonly string[]): string {
  const index = Math.min(scale.length - 1, Math.floor(value * scale.length));
  return scale[Math.max(0, index)];
}

/**
 * A ticked slider.
 *
 * The ticks are a mask over a two-stop fill, so the filled and unfilled halves
 * are one element and always line up. A native range input sits on top at zero
 * opacity, which keeps dragging, keyboard control and screen-reader semantics
 * for free rather than reinventing them.
 */
export function Slider({
  label,
  hint,
  value,
  onChange,
  scale,
  measured = false,
}: SliderProps) {
  const id = useId();
  const fill = Math.round(value * 100);
  const word = wordFor(value, scale);

  return (
    <div className="tick">
      <div className="tick__head">
        <label className="tick__label" htmlFor={id}>
          {label}
          {hint && <span className="tick__hint">{hint}</span>}
        </label>
        <span className="tick__value">
          {word}
          {measured && (
            <span className="tick__measured" title="Measured, not inferred">
              measured
            </span>
          )}
        </span>
      </div>

      <div className="tick__track" style={{ ['--tick-fill' as string]: `${fill}%` }}>
        <div className="tick__marks" aria-hidden="true" />
        <div className="tick__thumb" aria-hidden="true" />
        <input
          id={id}
          className="tick__input"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={value}
          aria-valuetext={word}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
