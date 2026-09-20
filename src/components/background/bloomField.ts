import type { MoodVisualState } from '../../types';

/**
 * The ground.
 *
 * Was a field of soft coloured lights. That reading of "atmosphere" is the
 * house style of every AI product demo, and it fought the rest of the
 * interface, so the mood data now drives a contour field instead: horizontal
 * traces displaced by layered noise, the way a topographic map or a seismic
 * plot is drawn. Same inputs, entirely different material.
 *
 * It is line work, not light. Nothing glows, nothing is blurred, and the only
 * colour is a rationed amount of signal on a handful of traces. A mood makes
 * the terrain denser, rougher or calmer; it does not make it a different hue.
 *
 * The class name and its API are unchanged so the rest of the background stack
 * did not have to be rewritten around it.
 */

/** Lines want to stay crisp, so this renders close to display resolution. */
const RENDER_SCALE = 0.8;

export interface BloomFieldOptions {
  /** 0-1: how present the field is. Rises through the analysis. */
  resolution: number;
  reducedMotion: boolean;
  /** Lower on content-heavy screens, where the ground should step back. */
  quality: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpState(
  a: MoodVisualState,
  b: MoodVisualState,
  t: number,
): MoodVisualState {
  return {
    hueA: lerp(a.hueA, b.hueA, t),
    hueB: lerp(a.hueB, b.hueB, t),
    warmth: lerp(a.warmth, b.warmth, t),
    density: lerp(a.density, b.density, t),
    softness: lerp(a.softness, b.softness, t),
    curvature: lerp(a.curvature, b.curvature, t),
    motion: lerp(a.motion, b.motion, t),
    contrast: lerp(a.contrast, b.contrast, t),
    turbulence: lerp(a.turbulence, b.turbulence, t),
  };
}

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
    // Slow. The terrain should drift, not scroll.
    this.time += dt * (0.00004 + this.current.motion * 0.00012);

    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionDuration);
      this.current = lerpState(this.current, this.target, this.transition);
      if (this.transition >= 1) this.current = { ...this.target };
    }

    this.draw();
  }

  /** Layered sines. Continuous, cheap, and it never repeats visibly. */
  private displace(x: number, row: number, state: MoodVisualState): number {
    const t = this.time;
    const rough = 0.4 + state.turbulence * 1.6;
    return (
      Math.sin(x * 0.0055 + t * 2 + row * 0.22) * 26 * rough +
      Math.sin(x * 0.0131 - t * 3.1 + row * 0.5) * 11 * rough +
      Math.sin(x * 0.0029 + t * 1.3 + row * 0.08) * 40 * (0.3 + state.curvature)
    );
  }

  draw(): void {
    const { ctx, width, height } = this;
    if (width === 0 || height === 0) return;

    const state = this.current;
    const presence = Math.max(0, Math.min(1, this.options.resolution)) *
      Math.max(0.25, Math.min(1, this.options.quality));

    ctx.fillStyle = '#080b0a';
    ctx.fillRect(0, 0, width, height);

    // Line spacing follows density: a dense mood is finer contour, not brighter.
    const gap = Math.round(lerp(26, 11, state.density));
    const rows = Math.ceil(height / gap) + 4;
    const step = Math.max(6, Math.round(14 - state.contrast * 6));

    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';

    for (let row = 0; row < rows; row += 1) {
      const baseY = row * gap - gap * 2;

      // A few traces carry the signal. Rationed: roughly one in nine, chosen
      // by index so the same lines stay hot as the field drifts.
      const hot = row % 9 === 3;
      const strength = (0.05 + state.contrast * 0.1) * presence;

      ctx.strokeStyle = hot
        ? `oklch(0.7 0.19 47 / ${(strength * 1.9).toFixed(3)})`
        : `oklch(0.82 0.014 92 / ${strength.toFixed(3)})`;

      ctx.beginPath();
      for (let x = -step; x <= width + step; x += step) {
        // The vertical scale of the displacement falls off towards the top,
        // so the field has a horizon rather than being uniformly noisy.
        const falloff = 0.25 + (baseY / height) * 0.95;
        const y = baseY + this.displace(x, row, state) * falloff;
        if (x <= 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // A single horizon rule, to give the composition a datum.
    ctx.strokeStyle = `oklch(0.42 0.007 150 / ${(0.5 * presence).toFixed(3)})`;
    ctx.beginPath();
    const horizon = Math.round(height * 0.32);
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();
  }
}
