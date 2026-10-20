import { useState, type CSSProperties } from 'react';
import { AXES } from '../../features/song/axes';
import type { AxisReadings } from '../../features/song/axisReading';
import './dev.css';

interface AxisReadoutProps {
  readings: AxisReadings;
}

const pct = (value: number) => `${Math.round(value * 100)}`;

/**
 * The machine's reading of the eight scales, with every piece of evidence
 * behind each one. Tap an axis to see who said what.
 */
export function AxisReadout({ readings }: AxisReadoutProps) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="axr">
      {AXES.map((axis) => {
        const reading = readings[axis.id];
        const isOpen = open === axis.id;
        return (
          <li key={axis.id} className={`axr__row axr__row--${reading.origin}`}>
            <button
              type="button"
              className="axr__head"
              onClick={() => setOpen(isOpen ? null : axis.id)}
              aria-expanded={isOpen}
            >
              <span className="axr__name">{axis.label}</span>
              <span
                className="axr__track"
                style={
                  {
                    '--at': `${reading.value * 100}%`,
                    '--conf': reading.confidence,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                <span className="axr__mark" />
              </span>
              <span className="axr__value">{reading.origin === 'none' ? '–' : pct(reading.value)}</span>
              <span className="axr__meta">
                {axis.low} ↔ {axis.high} · {reading.origin} · {reading.primary} · c
                {pct(reading.confidence)}
              </span>
            </button>
            {isOpen && (
              <ul className="axr__evidence">
                {reading.evidence.length === 0 && <li>No source spoke to this axis.</li>}
                {reading.evidence.map((item, index) => (
                  <li key={index}>
                    <span className="axr__src">{item.source}</span>
                    <span className="axr__field">{item.field}</span>
                    <span className="axr__num">
                      {typeof item.raw === 'number' && `${pct(item.raw)}→`}
                      {pct(item.value)} · c{pct(item.confidence)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
