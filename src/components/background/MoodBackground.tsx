import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { MoodVisualState } from '../../types';
import { BloomFieldRenderer } from './bloomField';
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
 * The mood field. Sits behind everything and owns no layout.
 */
export function MoodBackground({
  state,
  resolution = 1,
  quality = 1,
  transitionMs = 1100,
  className,
}: MoodBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BloomFieldRenderer | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: BloomFieldRenderer;
    try {
      renderer = new BloomFieldRenderer(canvas, state, {
        resolution,
        reducedMotion,
        quality,
      });
    } catch {
      return; // No 2D context: the CSS base layer still paints an atmosphere.
    }
    rendererRef.current = renderer;

    const parent = canvas.parentElement;
    const applySize = () => {
      const rect = parent?.getBoundingClientRect();
      renderer.resize(
        rect?.width || window.innerWidth,
        rect?.height || window.innerHeight,
      );
    };

    applySize();
    renderer.start();

    const observer = new ResizeObserver(applySize);
    if (parent) observer.observe(parent);
    window.addEventListener('orientationchange', applySize);

    const onVisibility = () => {
      if (document.hidden) renderer.stop();
      else renderer.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', applySize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.stop();
      rendererRef.current = null;
    };
    // The renderer is imperative; state changes are pushed in by the effects
    // below rather than by tearing it down and rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    rendererRef.current?.setState(state, transitionMs);
  }, [state, transitionMs]);

  useEffect(() => {
    rendererRef.current?.setOptions({ resolution, quality, reducedMotion });
  }, [resolution, quality, reducedMotion]);

  return (
    <div
      className={`mood-bg${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={
        {
          '--mood-hue-a': `${state.hueA}`,
          '--mood-hue-b': `${state.hueB}`,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} className="mood-bg__canvas" />
      <div className="mood-bg__grain" />
      <div className="mood-bg__vignette" />
    </div>
  );
}
