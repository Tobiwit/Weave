import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { MoodVisualState } from '../../types';
import { MoodFieldRenderer } from './moodField';
import './MoodBackground.css';

interface MoodBackgroundProps {
  state: MoodVisualState;
  /** 0-1: how resolved the environment is. Rises through the analysis. */
  resolution?: number;
  /** Lower on list screens where the material should stay in the background. */
  quality?: number;
  transitionMs?: number;
  className?: string;
}

/**
 * The full-screen mood material. Sits behind everything and owns no layout.
 */
export function MoodBackground({
  state,
  resolution = 1,
  quality = 1,
  transitionMs = 1100,
  className,
}: MoodBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MoodFieldRenderer | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: MoodFieldRenderer;
    try {
      renderer = new MoodFieldRenderer(canvas, state, {
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
      const width = rect?.width || window.innerWidth;
      const height = rect?.height || window.innerHeight;
      // Capping DPR keeps large phone screens from paying for pixels that the
      // blur immediately throws away.
      renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, 2));
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
    // The renderer is imperative; state changes are pushed in via the effects
    // below rather than by rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    rendererRef.current?.setState(state, transitionMs);
  }, [state, transitionMs]);

  useEffect(() => {
    rendererRef.current?.setOptions({ resolution, quality, reducedMotion });
  }, [resolution, quality, reducedMotion]);

  const softness = state.softness;

  return (
    <div
      className={`mood-bg${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={
        {
          '--mood-blur': `${3 + softness * 11}px`,
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
