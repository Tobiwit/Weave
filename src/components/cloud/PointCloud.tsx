import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { PointCloudRenderer } from './pointCloudRenderer';
import './PointCloud.css';

interface PointCloudProps {
  /** Arrival of each stream of points, 0-1. One stream per signal source. */
  streams: number[];
  hueA: number;
  hueB: number;
  /** 0-1. The cloud tightens and brightens as the reading resolves. */
  convergence?: number;
  speed?: number;
  quality?: number;
  /** Sits between the two halves of the cloud, so points pass in front and behind. */
  children?: ReactNode;
}

export function PointCloud({
  streams,
  hueA,
  hueB,
  convergence = 0,
  speed = 0.5,
  quality = 1,
  children,
}: PointCloudProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PointCloudRenderer | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const back = backRef.current;
    const front = frontRef.current;
    const host = hostRef.current;
    if (!back || !front || !host) return;

    let renderer: PointCloudRenderer;
    try {
      renderer = new PointCloudRenderer(back, front, {
        streams,
        hueA,
        hueB,
        convergence,
        speed,
        quality,
        reducedMotion,
      });
    } catch {
      return; // No 2D context. The scene still works without the cloud.
    }
    rendererRef.current = renderer;

    const applySize = () => {
      const rect = host.getBoundingClientRect();
      renderer.resize(
        rect.width,
        rect.height,
        // Glow sprites are soft, so extra device pixels buy nothing visible.
        Math.min(window.devicePixelRatio || 1, 2),
      );
    };

    applySize();
    renderer.start();

    const observer = new ResizeObserver(applySize);
    observer.observe(host);

    const onVisibility = () => {
      if (document.hidden) renderer.stop();
      else renderer.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.stop();
      rendererRef.current = null;
    };
    // The renderer is imperative; prop changes are pushed in by the effect below
    // rather than by tearing it down and rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    rendererRef.current?.setOptions({
      streams,
      hueA,
      hueB,
      convergence,
      speed,
      quality,
      reducedMotion,
    });
  }, [streams, hueA, hueB, convergence, speed, quality, reducedMotion]);

  return (
    <div className="cloud" ref={hostRef}>
      <canvas ref={backRef} className="cloud__layer" aria-hidden="true" />
      {children && <div className="cloud__center">{children}</div>}
      <canvas ref={frontRef} className="cloud__layer cloud__layer--front" aria-hidden="true" />
    </div>
  );
}
