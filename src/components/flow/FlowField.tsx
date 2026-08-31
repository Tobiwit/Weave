import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { buildFlowPath, seedFrom, type Point } from './flowPath';
import './FlowField.css';

export interface FlowNode {
  id: string;
  /** Normalised 0-1 position within the field. */
  x: number;
  y: number;
  intensity?: number;
}

export interface FlowConnection {
  from: string;
  to: string;
  /** 0-1. Drives width, opacity and how directly the thread runs. */
  strength?: number;
  active?: boolean;
}

export interface FlowFieldProps {
  nodes: FlowNode[];
  connections: FlowConnection[];
  /** 0-1 draw-in progress. 1 means fully drawn. */
  progress?: number;
  /** Slow continuous deformation of the threads. */
  deform?: boolean;
  /** Small motes travelling along active threads. */
  particles?: boolean;
  hueA?: number;
  hueB?: number;
  className?: string;
}

interface Size {
  width: number;
  height: number;
}

const PARTICLES_PER_THREAD = 2;

/**
 * The reusable thread system.
 *
 * Threads are irregular cubic paths with gradient strokes, drawn in with a
 * dash offset and deformed slowly against refs so React does not re-render per
 * frame. It takes only geometry and strength, never page-specific logic, so
 * every screen composes it differently: signals arriving at a central node,
 * several sources merging, or a song leaning toward playlist regions.
 */
export function FlowField({
  nodes,
  connections,
  progress = 1,
  deform = true,
  particles = false,
  hueA = 250,
  hueB = 318,
  className,
}: FlowFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const particleRefs = useRef(new Map<string, SVGCircleElement>());
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const gradientId = useId().replace(/:/g, '');

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const nodeMap = useMemo(() => {
    const map = new Map<string, Point & { intensity: number }>();
    for (const node of nodes) {
      map.set(node.id, {
        x: node.x * size.width,
        y: node.y * size.height,
        intensity: node.intensity ?? 0.6,
      });
    }
    return map;
  }, [nodes, size.width, size.height]);

  const threads = useMemo(() => {
    return connections
      .map((connection) => {
        const from = nodeMap.get(connection.from);
        const to = nodeMap.get(connection.to);
        if (!from || !to) return null;
        const key = `${connection.from}->${connection.to}`;
        return {
          key,
          connection,
          from,
          to,
          seed: seedFrom(key),
          strength: connection.strength ?? 0.5,
        };
      })
      .filter((thread): thread is NonNullable<typeof thread> => thread !== null);
  }, [connections, nodeMap]);

  // Deformation and particle travel share one loop and write straight to the DOM.
  useEffect(() => {
    if (size.width === 0) return;
    const shouldAnimate = deform && !reducedMotion;

    const paint = (time: number) => {
      for (const thread of threads) {
        const element = pathRefs.current.get(thread.key);
        if (!element) continue;
        const d = buildFlowPath(thread.from, thread.to, {
          seed: thread.seed,
          // Stronger connections run more directly; weak ones wander.
          curvature: 0.5 + (1 - thread.strength) * 0.5,
          time: shouldAnimate ? time : 0,
          turbulence: 0.4 + (1 - thread.strength) * 0.4,
        });
        element.setAttribute('d', d);
        pathRefs.current.get(`glow-${thread.key}`)?.setAttribute('d', d);

        if (!particles || !thread.connection.active) continue;
        const total = element.getTotalLength();
        for (let i = 0; i < PARTICLES_PER_THREAD; i += 1) {
          const dot = particleRefs.current.get(`${thread.key}:${i}`);
          if (!dot) continue;
          const offset = (i / PARTICLES_PER_THREAD + thread.seed) % 1;
          const travel = shouldAnimate ? (time * 0.09 + offset) % 1 : offset;
          const point = element.getPointAtLength(travel * total);
          dot.setAttribute('cx', String(point.x));
          dot.setAttribute('cy', String(point.y));
          // Fade in and out at the ends so motes emerge from the material.
          const fade = Math.sin(travel * Math.PI);
          dot.setAttribute('opacity', String(fade * 0.8 * thread.strength));
        }
      }
    };

    paint(0);
    if (!shouldAnimate && !particles) return;
    if (reducedMotion) return;

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      paint((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [threads, deform, particles, reducedMotion, size.width, size.height]);

  return (
    <div ref={containerRef} className={`flow${className ? ` ${className}` : ''}`} aria-hidden="true">
      {size.width > 0 && (
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="flow__svg"
        >
          <defs>
            {threads.map((thread) => (
              <linearGradient
                key={thread.key}
                id={`${gradientId}-${thread.key}`}
                gradientUnits="userSpaceOnUse"
                x1={thread.from.x}
                y1={thread.from.y}
                x2={thread.to.x}
                y2={thread.to.y}
              >
                <stop
                  offset="0%"
                  stopColor={`hsl(${hueA}, 78%, 74%)`}
                  stopOpacity={0.05}
                />
                <stop
                  offset="45%"
                  stopColor={`hsl(${(hueA + hueB) / 2}, 82%, 76%)`}
                  stopOpacity={0.55}
                />
                <stop
                  offset="100%"
                  stopColor={`hsl(${hueB}, 80%, 72%)`}
                  stopOpacity={0.12}
                />
              </linearGradient>
            ))}
            <filter id={`${gradientId}-soft`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* A blurred copy underneath makes threads feel embedded in the field. */}
          <g filter={`url(#${gradientId}-soft)`} opacity={0.5}>
            {threads.map((thread) => (
              <path
                key={`glow-${thread.key}`}
                className="flow__thread"
                ref={(element) => {
                  if (element) pathRefs.current.set(`glow-${thread.key}`, element);
                }}
                d={buildFlowPath(thread.from, thread.to, {
                  seed: thread.seed,
                  curvature: 0.5 + (1 - thread.strength) * 0.5,
                  time: 0,
                  turbulence: 0.4,
                })}
                fill="none"
                stroke={`url(#${gradientId}-${thread.key})`}
                strokeWidth={2 + thread.strength * 7}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - progress}
                opacity={thread.connection.active ? 0.9 : 0.4}
              />
            ))}
          </g>

          {threads.map((thread) => (
            <path
              key={thread.key}
              ref={(element) => {
                if (element) pathRefs.current.set(thread.key, element);
              }}
              className="flow__thread"
              fill="none"
              stroke={`url(#${gradientId}-${thread.key})`}
              strokeWidth={0.6 + thread.strength * 2.2}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
              opacity={0.35 + thread.strength * 0.5}
            />
          ))}

          {particles &&
            threads
              .filter((thread) => thread.connection.active)
              .flatMap((thread) =>
                Array.from({ length: PARTICLES_PER_THREAD }, (_, i) => (
                  <circle
                    key={`${thread.key}:${i}`}
                    ref={(element) => {
                      if (element) particleRefs.current.set(`${thread.key}:${i}`, element);
                    }}
                    r={1.1 + thread.strength * 1.4}
                    fill={`hsl(${(hueA + hueB) / 2}, 90%, 84%)`}
                    opacity={0}
                  />
                )),
              )}
        </svg>
      )}
    </div>
  );
}
