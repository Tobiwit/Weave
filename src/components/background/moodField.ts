import type { MoodVisualState } from '../../types';

/**
 * Canvas renderer for the woven mood material.
 *
 * The goal is the perception of dense organic fibre, not a simulation. Strands
 * are grouped into bundles so the field reads as woven rather than as a set of
 * lines, drawn additively so overlaps bloom, and softened by a CSS blur on the
 * canvas element itself (cheap, GPU composited) instead of a canvas filter.
 *
 * All animation happens here against refs. React never re-renders per frame.
 */

export interface MoodFieldOptions {
  /** 0-1: how defined the field is. Low values read as vague and unresolved. */
  resolution: number;
  reducedMotion: boolean;
  /** Multiplier on strand count, for cheaper background usage on list screens. */
  quality: number;
}

interface Bundle {
  offset: number;
  strands: number;
  drift: number;
  phase: number;
  weight: number;
}

const TAU = Math.PI * 2;

/** Cheap deterministic value noise; smooth enough for slow deformation. */
function noise(x: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return noise(i, seed) * (1 - u) + noise(i + 1, seed) * u;
}

export class MoodFieldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  private current: MoodVisualState;
  private target: MoodVisualState;
  private transition = 1;
  private transitionDuration = 1100;

  private options: MoodFieldOptions;
  private bundles: Bundle[] = [];
  private time = 0;
  private raf = 0;
  private lastFrame = 0;
  private running = false;

  constructor(
    canvas: HTMLCanvasElement,
    initial: MoodVisualState,
    options: MoodFieldOptions,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.current = { ...initial };
    this.target = { ...initial };
    this.options = options;
    this.buildBundles();
  }

  private buildBundles(): void {
    const { density } = this.current;
    const quality = this.options.quality;
    const bundleCount = Math.max(3, Math.round((4 + density * 4) * quality));
    const perBundle = Math.max(6, Math.round((11 + density * 15) * quality));

    this.bundles = Array.from({ length: bundleCount }, (_, i) => ({
      offset: (i + 0.5) / bundleCount,
      strands: perBundle,
      drift: 0.3 + noise(i * 3.7, 11) * 0.8,
      phase: noise(i * 1.3, 5) * TAU,
      weight: 0.6 + noise(i * 2.1, 19) * 0.7,
    }));
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setState(next: MoodVisualState, durationMs = 1100): void {
    this.target = { ...next };
    this.transition = 0;
    this.transitionDuration = Math.max(1, durationMs);
    if (this.options.reducedMotion) {
      this.current = { ...next };
      this.transition = 1;
      this.buildBundles();
      this.draw();
    }
  }

  setOptions(options: Partial<MoodFieldOptions>): void {
    const previousQuality = this.options.quality;
    this.options = { ...this.options, ...options };
    if (options.quality !== undefined && options.quality !== previousQuality) {
      this.buildBundles();
    }
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
    // Motion is deliberately slow: this is ambient material, not an animation.
    this.time += dt * (0.00004 + this.current.motion * 0.00022);

    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt / this.transitionDuration);
      const t = easeInOut(this.transition);
      this.current = lerpState(this.current, this.target, t, this.transition);
      if (this.transition >= 1) {
        this.current = { ...this.target };
        this.buildBundles();
      }
    }

    this.draw();
  }

  draw(): void {
    const { ctx, width, height } = this;
    if (width === 0 || height === 0) return;

    const s = this.current;
    const resolution = clamp01(this.options.resolution);

    ctx.clearRect(0, 0, width, height);
    this.paintBase(s, resolution);

    ctx.globalCompositeOperation = 'lighter';

    const curveAmp = height * (0.03 + s.curvature * 0.16);
    // Bundles overlap, which is what makes the field read as woven depth
    // rather than as a set of separate ribbons.
    const strandSpread = height * (0.12 + s.density * 0.16);
    const segments = 18;

    for (const bundle of this.bundles) {
      const centerY = height * (0.08 + bundle.offset * 0.86);
      const bundlePhase = this.time * bundle.drift + bundle.phase;

      for (let i = 0; i < bundle.strands; i += 1) {
        const k = bundle.strands === 1 ? 0.5 : i / (bundle.strands - 1);
        const lateral = (k - 0.5) * strandSpread * bundle.weight;
        const seedOffset = bundle.phase * 3 + i * 0.37;

        // Strands nearest the bundle core are brighter and thicker.
        const core = 1 - Math.abs(k - 0.5) * 2;
        const alpha =
          (0.012 + core * 0.062 * (0.45 + s.contrast)) * (0.28 + resolution * 0.9);
        const hue = s.hueA + (s.hueB - s.hueA) * (bundle.offset * 0.7 + k * 0.3);
        const light = 52 + s.contrast * 28 + core * 16;
        const sat = 42 + s.warmth * 34;

        ctx.beginPath();
        for (let seg = 0; seg <= segments; seg += 1) {
          const t = seg / segments;
          const x = -width * 0.1 + t * width * 1.2;

          const wave =
            Math.sin(t * TAU * (0.7 + s.curvature * 1.3) + bundlePhase) * curveAmp;
          const wobble =
            (smoothNoise(t * (2 + s.turbulence * 6) + seedOffset + this.time * 2, 7) -
              0.5) *
            curveAmp *
            (0.4 + s.turbulence * 1.6);
          const y = centerY + lateral + wave + wobble;

          if (seg === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
        ctx.lineWidth =
          (0.7 + core * (1.2 + s.density * 3.6)) * (0.6 + resolution * 0.7);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  /** Deep field plus two soft blooms; the strands are drawn on top of this. */
  private paintBase(s: MoodVisualState, resolution: number): void {
    const { ctx, width, height } = this;

    const base = ctx.createLinearGradient(0, 0, width * 0.4, height);
    base.addColorStop(0, `hsl(${s.hueA}, 38%, 6%)`);
    base.addColorStop(0.55, `hsl(${(s.hueA + s.hueB) / 2}, 34%, 9%)`);
    base.addColorStop(1, `hsl(${s.hueB}, 30%, 5%)`);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const bloomStrength = (0.07 + s.contrast * 0.22) * (0.35 + resolution * 0.85);

    const glowA = ctx.createRadialGradient(
      width * (0.24 + Math.sin(this.time * 0.6) * 0.05),
      height * 0.3,
      0,
      width * 0.24,
      height * 0.3,
      Math.max(width, height) * 0.72,
    );
    glowA.addColorStop(0, `hsla(${s.hueA}, ${52 + s.warmth * 20}%, 58%, ${bloomStrength})`);
    glowA.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, width, height);

    const glowB = ctx.createRadialGradient(
      width * (0.78 - Math.cos(this.time * 0.5) * 0.05),
      height * 0.72,
      0,
      width * 0.78,
      height * 0.72,
      Math.max(width, height) * 0.66,
    );
    glowB.addColorStop(
      0,
      `hsla(${s.hueB}, ${50 + s.warmth * 26}%, 56%, ${bloomStrength * 0.9})`,
    );
    glowB.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, width, height);
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpState(
  from: MoodVisualState,
  to: MoodVisualState,
  eased: number,
  raw: number,
): MoodVisualState {
  // Blend from the live value so an interrupted transition stays continuous.
  const k = raw >= 1 ? 1 : Math.min(1, eased * 0.35 + 0.02);
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
