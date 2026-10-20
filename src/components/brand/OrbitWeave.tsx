import { useEffect, useRef, type CSSProperties } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * The Weave mark: five concentric half circles.
 *
 * Two motions, mixed. Orbit: each arc turns at its own speed and direction, so
 * the five keep drifting apart and passing through each other. Weave: while
 * the machine is working, each arc also folds through its own diameter in
 * turn, a wave travelling outward through the set. As `progress` rises the
 * arcs are drawn into one shared angle and the folding stops, until at 1 they
 * sit stacked as a single figure: the reading has come together.
 *
 * Driven by one requestAnimationFrame loop writing transforms directly, so it
 * can follow real pipeline progress rather than a fixed keyframe.
 */

export type OrbitMode = 'still' | 'idle' | 'working' | 'settled';

interface OrbitWeaveProps {
  size?: number | string;
  mode?: OrbitMode;
  /** 0-1: how far the arcs have been drawn into alignment. */
  progress?: number;
  /** `light` uses the glow ramp; `ink` uses currentColor, for small marks. */
  tone?: 'light' | 'ink';
  /** Stroke weight as a multiple of the default. */
  weight?: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
}

const RADII = [9, 17, 25, 33, 41];
/** Degrees per second; alternate directions so arcs pass through each other. */
const SPEEDS = [34, -27, 21, -16, 12];
/** Where each arc rests when drawn still: a fan, so the mark reads as five. */
const REST = [0, 34, 68, 102, 136];
const LIGHT = [
  'var(--c-cyan)',
  'oklch(0.87 0.11 190)',
  'var(--c-mint)',
  'var(--c-lime)',
  'var(--c-citron)',
];

/** One arc turning over takes this long; the next starts this much later. */
const FLIP_SECONDS = 0.7;
const FLIP_STAGGER = 0.38;
/** How long an arc rests between turns. */
const FLIP_INTERVAL = 2.6;

const MODE_SPEED: Record<OrbitMode, number> = {
  still: 0,
  idle: 0.55,
  working: 1.6,
  settled: 0.25,
};

const MODE_FOLD: Record<OrbitMode, number> = {
  still: 0,
  idle: 0,
  working: 1,
  settled: 0,
};

function half(r: number): string {
  return `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`;
}

function transformFor(angle: number, fold: number): string {
  return `rotate(${angle.toFixed(2)}) scale(1 ${fold.toFixed(3)})`;
}

export function OrbitWeave({
  size = 120,
  mode = 'idle',
  progress = 0,
  tone = 'light',
  weight = 1,
  className,
  style,
  label,
}: OrbitWeaveProps) {
  const arcs = useRef<(SVGPathElement | null)[]>([]);
  const reducedMotion = useReducedMotion();
  // Targets live in refs so the loop reads the latest without restarting.
  const target = useRef({ mode, progress });
  useEffect(() => {
    target.current = { mode, progress };
  }, [mode, progress]);

  const animated = mode !== 'still' && !reducedMotion;

  useEffect(() => {
    if (!animated) return;
    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let speed = MODE_SPEED[target.current.mode];
    let fold = MODE_FOLD[target.current.mode];
    let align = target.current.mode === 'settled' ? 1 : target.current.progress;
    const phase = RADII.map((_, i) => REST[i]);
    // The weave, per arc: which way it faces, whether it is mid-turn, and
    // when it next turns. A turn always completes; it is never blended with
    // anything, so no arc can be left squashed edge-on.
    const facing = RADII.map(() => 1);
    const turnStart: (number | null)[] = RADII.map(() => null);
    const nextTurn = RADII.map((_, i) => 0.4 + i * FLIP_STAGGER);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const goal = target.current;
      // Every dial eases toward its target so mode changes flow, never cut.
      const ease = 1 - Math.exp(-dt * 3);
      speed += (MODE_SPEED[goal.mode] - speed) * ease;
      fold += (MODE_FOLD[goal.mode] - fold) * ease;
      const alignGoal = goal.mode === 'settled' ? 1 : Math.min(1, Math.max(0, goal.progress));
      align += (alignGoal - align) * (1 - Math.exp(-dt * 2.2));
      clock += dt;

      // The shared angle the arcs converge on drifts slowly so the settled
      // figure still breathes.
      const shared = 180 + Math.sin(clock * 0.4) * 6;
      // Turning over only happens while the machine is working and the
      // figure has not yet come together.
      const weaving = fold * (1 - align) > 0.3;

      RADII.forEach((_, i) => {
        phase[i] += SPEEDS[i] * speed * dt;
        const angle = phase[i] + (shared - phase[i]) * align;

        const start = turnStart[i];
        if (start === null) {
          // Start a turn on schedule while weaving, or to come back face-up
          // once weaving stops, so a settled figure always faces one way.
          if ((weaving && clock >= nextTurn[i]) || (!weaving && facing[i] === -1)) {
            turnStart[i] = clock;
          }
        }

        let scaleY = facing[i];
        const begun = turnStart[i];
        if (begun !== null) {
          const t = Math.min(1, (clock - begun) / FLIP_SECONDS);
          const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
          scaleY = facing[i] * Math.cos(Math.PI * eased);
          if (t >= 1) {
            facing[i] = -facing[i];
            scaleY = facing[i];
            turnStart[i] = null;
            nextTurn[i] = clock + FLIP_INTERVAL;
          }
        }
        arcs.current[i]?.setAttribute('transform', transformFor(angle, scaleY));
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated]);

  // Without motion the mark is drawn at rest, or aligned once settled.
  const restAngle = (i: number) =>
    mode === 'settled' || (!animated && progress >= 1) ? 180 : REST[i] + 180;

  const dimension = typeof size === 'number' ? `${size}px` : size;
  const stroke = 4.6 * weight;

  return (
    <svg
      className={className}
      style={{ width: dimension, height: dimension, overflow: 'visible', ...style }}
      viewBox="-50 -50 100 100"
      fill="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {RADII.map((r, i) => (
        <path
          key={r}
          ref={(node) => {
            arcs.current[i] = node;
          }}
          d={half(r)}
          transform={transformFor(restAngle(i), 1)}
          style={{ stroke: tone === 'light' ? LIGHT[i] : 'currentColor' }}
          strokeWidth={stroke}
          strokeLinecap="round"
          opacity={tone === 'ink' ? 0.55 + i * 0.11 : 1}
        />
      ))}
    </svg>
  );
}
