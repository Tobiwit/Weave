import type { CSSProperties } from 'react';
import type { MoodVisualState } from '../../types';
import './MoodBackground.css';

interface MoodBackgroundProps {
  state: MoodVisualState;
  /** 0-1: how present the light is. Rises through the analysis. */
  resolution?: number;
  /** Lower on content-heavy screens where the field should step back. */
  quality?: number;
  transitionMs?: number;
  className?: string;
}

/**
 * The glow. Light rising from the foot of the screen, the way a phone looks
 * when something is playing on it.
 *
 * Two soft radial fields, coloured from the glow ramp. A song's warmth slides
 * them from cyan toward lime; how far a reading has resolved decides how much
 * light there is. Pure CSS: the colours are registered custom properties, so
 * a change of mood is a transition the browser runs, not a render loop.
 */
export function MoodBackground({
  state,
  resolution = 1,
  quality = 1,
  transitionMs = 1400,
  className,
}: MoodBackgroundProps) {
  const warmth = clamp(state.warmth);
  const strength = clamp(resolution) * (0.62 + clamp(state.contrast) * 0.38) * clamp(quality, 0.35);

  // Hue runs along the ramp: cool songs sit in cyan, warm ones in lime.
  const hueA = 214 - warmth * 60;
  const hueB = 168 - warmth * 50;
  const spread = 0.8 + clamp(state.softness) * 0.5;

  const style = {
    '--glow-a': `oklch(0.82 0.12 ${hueA.toFixed(1)} / ${(0.55 * strength).toFixed(3)})`,
    '--glow-b': `oklch(0.88 0.16 ${hueB.toFixed(1)} / ${(0.6 * strength).toFixed(3)})`,
    '--glow-spread': spread.toFixed(3),
    '--glow-drift': `${(26 - clamp(state.motion) * 14).toFixed(1)}s`,
    '--glow-ms': `${transitionMs}ms`,
  } as CSSProperties;

  return (
    <div className={`glow${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      <div className="glow__field glow__field--a" />
      <div className="glow__field glow__field--b" />
    </div>
  );
}

function clamp(value: number, min = 0): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(1, Math.max(min, value));
}
