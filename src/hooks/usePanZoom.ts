import { useCallback, useRef, useState } from 'react';

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 6;

/**
 * Pointer-based pan and zoom for the Universe.
 *
 * Handles mouse drag, wheel zoom, one-finger pan and two-finger pinch through
 * the same pointer events, so touch and desktop share one code path and
 * nothing depends on hover.
 */
export function usePanZoom(initial: Transform = { x: 0, y: 0, scale: 1 }) {
  const [transform, setTransform] = useState<Transform>(initial);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const moved = useRef(false);

  const clampScale = (scale: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: transform.scale,
      };
    }
  }, [transform.scale]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / (pinchStart.current.distance || 1);
      moved.current = true;
      setTransform((current) => ({
        ...current,
        scale: clampScale(pinchStart.current!.scale * ratio),
      }));
      return;
    }

    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved.current = true;
    setTransform((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  }, []);

  const onWheel = useCallback((event: React.WheelEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    setTransform((current) => {
      const factor = Math.exp(-event.deltaY * 0.0016);
      const scale = clampScale(current.scale * factor);
      const applied = scale / current.scale;
      // Keep the point under the cursor fixed while zooming.
      return {
        scale,
        x: px - (px - current.x) * applied,
        y: py - (py - current.y) * applied,
      };
    });
  }, []);

  const reset = useCallback(() => setTransform(initial), [initial]);

  /** True when the last gesture was a drag, so taps can be told apart. */
  const wasDragged = useCallback(() => moved.current, []);

  return {
    transform,
    setTransform,
    reset,
    wasDragged,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
    },
  };
}
