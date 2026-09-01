import type { MoodVisualState } from '../../types';

/**
 * Volumetric bloom field.
 *
 * Large soft lights drifting through a near-black volume. No pattern, no
 * texture, no visible structure: the background is depth and colour only, so
 * type and artwork sit on it cleanly and any structured element on the page
 * reads as an object rather than competing with the wallpaper.
 *
 * The canvas renders at a fraction of display size and is scaled back up under
 * a heavy CSS blur. Every shape here is a soft radial gradient, so the detail
 * thrown away by that downscale is detail the blur would have destroyed anyway
 * — and it makes the whole field cost a few thousand pixels a frame.
 */

export interface BloomFieldOptions {
  /** 0-1: how present the light is. Low values read as vague and unresolved. */
  resolution: number;
  reducedMotion: boolean;
  /** Unused by the maths; kept so callers can hint at cost. */
  quality: number;
}

/** Display pixels per rendered pixel. The blur hides everything this loses. */
const RENDER_SCALE = 0.22;

interface Blob {
  /** Base position in normalised space. */
  x: number;
  y: number;
  /** Drift amplitude and rate. */
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  phase: number;
  radius: number;
  /** 0-1 position along the mood's hue range. */
  tint: number;
  weight: number;
}

const BLOBS: Blob[] = [
  { x: 0.28, y: 0.26, ax: 0.1, ay: 0.08, fx: 0.21, fy: 0.17, phase: 0, radius: 0.78, tint: 0, weight: 1 },
  { x: 0.74, y: 0.62, ax: 0.09, ay: 0.11, fx: 0.16, fy: 0.23, phase: 1.9, radius: 0.7, tint: 1, weight: 0.92 },
  { x: 0.52, y: 0.88, ax: 0.13, ay: 0.07, fx: 0.26, fy: 0.13, phase: 3.6, radius: 0.62, tint: 0.55, weight: 0.7 },
  { x: 0.14, y: 0.78, ax: 0.08, ay: 0.1, fx: 0.13, fy: 0.29, phase: 5.1, radius: 0.5, tint: 0.3, weight: 0.5 },
];

export class BloomFieldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  private current: MoodVisualState;
  private target: MoodVisualState;
  private transition = 1;
  private transitionDuration = 1100;

  private options: BloomFieldOptions;
  private time = 0;
  private raf = 0;
  private running = false;
  private lastFrame = 0;

  constructor(
    canvas: HTMLCanvasElement,
    initial: MoodVisualState,
    options: BloomFieldOptions,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.current = { ...initial };
    this.target = { ...initial };
    this.options = options;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width * RENDER_SCALE));
    this.height = Math.max(1, Math.round(height * RENDER_SCALE));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.draw();
  }

  setState(next: MoodVisualState, durationMs = 1100): void {
    this.target = { ...next };
    this.transition = 0;
    this.transitionDuration = Math.max(1, durationMs);
    if (this.options.reducedMotion) {
      this.current = { ...next };
      this.transition = 1;
      this.draw();
    }
  }

  setOptions(options: Partial<BloomFieldOptions>): void {
    this.options = { ...this.options, ...options };
    if (this.options.reducedMotion) this.draw();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();

    if (this.options.reducedMotion) {
      this.draw();
      return;
    }

    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(64, now - this.lastFrame);
      this.lastFrame = now;
      this.step(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private step(dt: number): void {
    // Very slow. The light should breathe, not travel.
    this.time += dt * (0.00006 + this.current.motion * 0.00016);

    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionDuration);
      this.current = lerpState(this.current, this.target, this.transition);
      if (this.transition >= 1) this.current = { ...this.target };
    }

    this.draw();
  }

  draw(): void {
    const { ctx, width, height } = this;
    if (width === 0 || height === 0) return;

    const s = this.current;
    const resolution = clamp01(this.options.resolution);
    const span = Math.max(width, height);

    // The volume the light sits in: almost black, tinted toward the mood.
    const ground = ctx.createLinearGradient(0, 0, width * 0.3, height);
    ground.addColorStop(0, `hsl(${s.hueA}, 42%, 5%)`);
    ground.addColorStop(1, `hsl(${s.hueB}, 38%, 3%)`);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';

    const hueSpan = ((s.hueB - s.hueA + 540) % 360) - 180;
    // Most of the frame stays near-black: the light is an event in the volume,
    // not a wash over it. Contrast opens the aperture; resolution is how far
    // the run has come.
    const gain = (0.34 + s.contrast * 0.5) * (0.3 + resolution * 0.9);
    const sat = 62 + s.warmth * 24;

    for (const blob of BLOBS) {
      const t = this.time + blob.phase;
      const cx = (blob.x + Math.sin(t * blob.fx * 6.283) * blob.ax) * width;
      const cy = (blob.y + Math.cos(t * blob.fy * 6.283) * blob.ay) * height;

      // Density tightens the lights; softness spreads them into the volume.
      const radius =
        span * blob.radius * (0.4 + s.softness * 0.34) * (1.12 - s.density * 0.28);
      const breathe = 1 + Math.sin(t * 1.7) * 0.06;

      const hue = (s.hueA + hueSpan * blob.tint + 360) % 360;
      const alpha = gain * blob.weight;

      const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * breathe);
      light.addColorStop(0, `hsla(${hue}, ${sat}%, 54%, ${alpha})`);
      light.addColorStop(0.35, `hsla(${hue}, ${sat}%, 44%, ${alpha * 0.38})`);
      light.addColorStop(1, `hsla(${hue}, ${sat}%, 36%, 0)`);
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function lerpState(
  from: MoodVisualState,
  to: MoodVisualState,
  raw: number,
): MoodVisualState {
  // Blending from the live value keeps an interrupted transition continuous.
  const k = raw >= 1 ? 1 : Math.min(1, raw * 0.3 + 0.02);
  const mix = (a: number, b: number) => a + (b - a) * k;
  const mixHue = (a: number, b: number) => {
    const delta = ((b - a + 540) % 360) - 180;
    return (a + delta * k + 360) % 360;
  };
  return {
    hueA: mixHue(from.hueA, to.hueA),
    hueB: mixHue(from.hueB, to.hueB),
    warmth: mix(from.warmth, to.warmth),
    density: mix(from.density, to.density),
    softness: mix(from.softness, to.softness),
    curvature: mix(from.curvature, to.curvature),
    motion: mix(from.motion, to.motion),
    contrast: mix(from.contrast, to.contrast),
    turbulence: mix(from.turbulence, to.turbulence),
  };
}
