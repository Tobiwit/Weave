import { useEffect, useRef, useState } from 'react';
import {
  useScanEnvelope,
  type Reading,
} from '../../features/observer/scanEnvelope';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useRuntimeSettings } from '../../hooks/useRuntimeSettings';
import { ScanFieldRenderer } from './scanField';
import './observer.css';

export type ScanMode = 'occupy' | 'mark';

interface MachineScanProps {
  /** True while real work is happening. Nothing renders otherwise. */
  active: boolean;
  /** What is being examined, in the machine's words. */
  label: string;
  /** Live facts about the work. Real values, not invented ones. */
  readings: Reading[];
  /**
   * `occupy` fills an empty region: use it where the interface is waiting and
   * there is nothing underneath to obscure. `mark` only draws an edge and one
   * label: use it where content is already on screen.
   */
  mode?: ScanMode;
  className?: string;
}

/**
 * The machine, working, inside the part of the interface that is working.
 *
 * Scoped to its own container rather than to the viewport. It measures the box
 * it was put in and draws only there, which is the whole difference between an
 * interface that is alive and an overlay sitting on top of one.
 *
 * It appears when something is genuinely being computed and leaves when that
 * finishes. Every value it prints is passed in by the thing doing the work, so
 * the readout is a window onto a real process rather than a decoration that
 * happens to look technical.
 *
 * Placement is the other half of the rule. In `occupy` mode the region is
 * empty by definition, so the form can take the middle. In `mark` mode there
 * is content, so nothing is drawn over it: the scan runs along the edge and
 * the readout sits in whatever margin the caller has reserved.
 */
export function MachineScan({
  active,
  label,
  readings,
  mode = 'occupy',
  className,
}: MachineScanProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ScanFieldRenderer | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const { observerIntensity } = useRuntimeSettings();

  const envelope = useScanEnvelope(active);
  const off = observerIntensity === 'off';
  const quiet = observerIntensity === 'subtle' || mode === 'mark';
  const visible = !off && envelope.intensity > 0.002;

  // The canvas is sized from the container, so the effect can never be larger
  // than the thing it belongs to.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || off) return;
    try {
      rendererRef.current = new ScanFieldRenderer(canvas, reducedMotion);
    } catch {
      return; // No 2D context; the readouts still carry the idea.
    }
    rendererRef.current.start();
    return () => {
      rendererRef.current?.stop();
      rendererRef.current = null;
    };
  }, [off, reducedMotion]);

  useEffect(() => {
    if (box.width > 0) rendererRef.current?.resize(box.width, box.height);
  }, [box]);

  useEffect(() => {
    rendererRef.current?.setEnvelope(envelope.intensity, mode);
  }, [envelope.intensity, mode]);

  if (off) return <div ref={hostRef} className="scan scan--off" aria-hidden="true" />;

  // Readings arrive in tiers so the readout accumulates as the work goes on
  // rather than appearing all at once.
  const depth = envelope.intensity;
  const shown = readings.filter((reading) => {
    const tier = reading.tier ?? 1;
    if (quiet) return tier === 0;
    if (tier === 0) return depth > 0.05;
    if (tier === 1) return depth > 0.4;
    return depth > 0.72;
  });

  return (
    <div
      ref={hostRef}
      className={`scan scan--${mode}${visible ? ' scan--on' : ''}${
        className ? ` ${className}` : ''
      }`}
      data-phase={envelope.phase}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="scan__field" />

      {visible && (
        <div className="scan__readout">
          <p className="scan__label">
            <span className="scan__labelKey">EXAMINING</span>
            <span className="scan__labelValue">{label}</span>
          </p>

          <ul className="scan__list">
            {shown.map((reading) => (
              <li key={reading.key} className="scan__row">
                <span className="scan__key">{reading.key}</span>
                <span className="scan__value">{reading.value}</span>
              </li>
            ))}
          </ul>

          <p className="scan__clock">
            <span>{envelope.phase.toUpperCase()}</span>
            <span>{envelope.elapsed.toFixed(2)}S</span>
          </p>
        </div>
      )}
    </div>
  );
}
