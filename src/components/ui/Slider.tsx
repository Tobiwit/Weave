import { useId } from 'react';
import './ui.css';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Shown instead of a percentage, e.g. "High" or "132 BPM". */
  displayValue?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  onChange,
  displayValue,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
}: SliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div className="slider">
      <div className="slider__head">
        <label className="slider__label" htmlFor={id}>
          {label}
        </label>
        <span className="slider__value">
          {displayValue ?? `${Math.round(fill)}%`}
        </span>
      </div>
      <input
        id={id}
        className="slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--slider-fill' as string]: `${fill}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
