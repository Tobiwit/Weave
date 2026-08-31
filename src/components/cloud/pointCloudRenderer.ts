/**
 * A swirling volumetric point cloud.
 *
 * Points sit on a soft spherical shell, rotate in 3D with differential speed by
 * latitude, and are drawn as pre-tinted glow sprites with additive blending.
 * Sprites mean no per-point gradient work, and additive blending means no depth
 * sorting: overlaps simply accumulate light.
 *
 * The cloud is split across two canvases, one behind the artwork and one in
 * front, so points genuinely pass around it rather than over a flat backdrop.
 *
 * Everything runs against refs. React never re-renders per frame.
 */

export interface PointCloudOptions {
  /** Target arrival, 0-1, for each stream of points. */
  streams: number[];
  hueA: number;
  hueB: number;
  /** 0-1. The cloud tightens and brightens as the reading resolves. */
  convergence: number;
  /** 0-1 rotation speed. */
  speed: number;
  reducedMotion: boolean;
  /** Multiplier on point count for lower-powered devices. */
  quality: number;
}

const SPRITE_COUNT = 7;
const SPRITE_SIZE = 32;
/** Points arrive from here before they join the shell. */
const SPAWN_RADIUS = 3.1;

export class PointCloudRenderer {
  private back: CanvasRenderingContext2D;
  private front: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  private options: PointCloudOptions;
  private sprites: HTMLCanvasElement[] = [];
  private spriteHueA = -1;
  private spriteHueB = -1;

  private count = 0;
  private theta!: Float32Array;
  private phi!: Float32Array;
  private radius!: Float32Array;
  private seed!: Float32Array;
  private stream!: Uint8Array;
  private tint!: Uint8Array;
  private drift!: Float32Array;

  /** Eased, per-stream arrival that chases the target in `options.streams`. */
  private arrival: number[] = [];
  private convergence = 0;

  private time = 0;
  private raf = 0;
  private running = false;
  private lastFrame = 0;

  constructor(
    back: HTMLCanvasElement,
    front: HTMLCanvasElement,
    options: PointCloudOptions,
  ) {
    const backCtx = back.getContext('2d');
    const frontCtx = front.getContext('2d');
    if (!backCtx || !frontCtx) throw new Error('Canvas 2D context unavailable');
    this.back = backCtx;
    this.front = frontCtx;
    this.options = options;
    this.arrival = options.streams.map(() => 0);
    this.buildPoints();
    this.buildSprites();
  }

  private buildPoints(): void {
    const streams = Math.max(1, this.options.streams.length);
    const target = Math.round(1900 * this.options.quality);
    this.count = Math.max(300, Math.min(2600, target));

    this.theta = new Float32Array(this.count);
    this.phi = new Float32Array(this.count);
    this.radius = new Float32Array(this.count);
    this.seed = new Float32Array(this.count);
    this.stream = new Uint8Array(this.count);
    this.tint = new Uint8Array(this.count);
    this.drift = new Float32Array(this.count);

    for (let i = 0; i < this.count; i += 1) {
      this.theta[i] = Math.random() * Math.PI * 2;
      // acos of a uniform value spreads points evenly over the sphere instead
      // of bunching them at the poles.
      this.phi[i] = Math.acos(2 * Math.random() - 1) - Math.PI / 2;
      // A shell with thickness reads as volume rather than as a hollow ball.
      this.radius[i] = 0.72 + Math.random() * 0.42;
      this.seed[i] = Math.random();
      this.stream[i] = i % streams;
      this.tint[i] = Math.floor(Math.random() * SPRITE_COUNT);
      this.drift[i] = 0.6 + Math.random() * 0.8;
    }
  }

  /** One pre-tinted glow sprite per hue step, drawn instead of per-point gradients. */
  private buildSprites(): void {
    const { hueA, hueB } = this.options;
    this.sprites = [];

    for (let i = 0; i < SPRITE_COUNT; i += 1) {
      const t = i / (SPRITE_COUNT - 1);
      const delta = ((hueB - hueA + 540) % 360) - 180;
      const hue = (hueA + delta * t + 360) % 360;

      const canvas = document.createElement('canvas');
      canvas.width = SPRITE_SIZE;
      canvas.height = SPRITE_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const c = SPRITE_SIZE / 2;
      const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
      gradient.addColorStop(0, `hsla(${hue}, 92%, 88%, 1)`);
      gradient.addColorStop(0.25, `hsla(${hue}, 88%, 74%, 0.62)`);
      gradient.addColorStop(0.6, `hsla(${hue}, 82%, 62%, 0.14)`);
      gradient.addColorStop(1, `hsla(${hue}, 80%, 58%, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

      this.sprites.push(canvas);
    }

    this.spriteHueA = hueA;
    this.spriteHueB = hueB;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    for (const ctx of [this.back, this.front]) {
      const canvas = ctx.canvas;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.draw();
  }

  setOptions(next: Partial<PointCloudOptions>): void {
    const previousQuality = this.options.quality;
    this.options = { ...this.options, ...next };

    if (this.options.streams.length !== this.arrival.length) {
      this.arrival = this.options.streams.map((_, i) => this.arrival[i] ?? 0);
      this.buildPoints();
    }
    if (next.quality !== undefined && next.quality !== previousQuality) {
      this.buildPoints();
    }
    // Rebuilding sprites is cheap but not free, so only on a real hue shift.
    if (
      Math.abs(this.options.hueA - this.spriteHueA) > 6 ||
      Math.abs(this.options.hueB - this.spriteHueB) > 6
    ) {
      this.buildSprites();
    }
    if (this.options.reducedMotion) {
      this.arrival = this.options.streams.map((value) => value);
      this.convergence = this.options.convergence;
      this.draw();
    }
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
      const dt = Math.min(50, now - this.lastFrame);
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
    this.time += dt * 0.001;

    // Arrival and convergence are eased here rather than in React so a stage
    // landing mid-frame never snaps the cloud.
    const ease = 1 - Math.pow(0.0012, dt / 1000);
    for (let i = 0; i < this.arrival.length; i += 1) {
      const target = this.options.streams[i] ?? 0;
      this.arrival[i] += (target - this.arrival[i]) * ease;
    }
    this.convergence += (this.options.convergence - this.convergence) * ease;

    this.draw();
  }

  draw(): void {
    const { width, height } = this;
    if (width === 0 || height === 0 || this.sprites.length === 0) return;

    this.back.clearRect(0, 0, width, height);
    this.front.clearRect(0, 0, width, height);
    this.back.globalCompositeOperation = 'lighter';
    this.front.globalCompositeOperation = 'lighter';

    const cx = width / 2;
    const cy = height / 2;
    // Width-led, capped by height: on a short stage the cloud spreads sideways
    // instead of shrinking to a ball that hugs the artwork.
    const shell = Math.min(width * 0.4, height * 0.62);
    const fov = shell * 2.6;

    const spin = this.time * (0.05 + this.options.speed * 0.28);
    // A slow tilt keeps the cloud from reading as a flat ring.
    const tilt = 0.38 + Math.sin(this.time * 0.11) * 0.16;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    const converged = this.convergence;
    const brightness = 0.55 + converged * 0.6;

    for (let i = 0; i < this.count; i += 1) {
      const arrival = this.arrival[this.stream[i]] ?? 0;
      if (arrival <= 0.002) continue;

      // Staggering by seed makes a stream stream in rather than pop in.
      const local = Math.min(1, Math.max(0, arrival * 1.85 - this.seed[i] * 0.85));
      if (local <= 0.002) continue;
      const eased = local * local * (3 - 2 * local);

      // Points fly in from outside and settle onto the shell.
      const rest = this.radius[i] * (1 - converged * 0.26);
      const r = (SPAWN_RADIUS + (rest - SPAWN_RADIUS) * eased) * shell;

      // Latitude-dependent speed: the equator leads, the poles trail.
      const lat = Math.cos(this.phi[i]);
      // Each point already carries a random theta, so the spin alone gives the
      // spread; the latitude term is what makes the rotation differential.
      const angle = this.theta[i] + spin * (0.55 + lat * 0.85);
      const wobble =
        Math.sin(this.time * 0.5 * this.drift[i] + this.seed[i] * 12) *
        0.05 *
        (1 - converged * 0.5);
      const latitude = this.phi[i] + wobble;

      const cl = Math.cos(latitude);
      const x = r * cl * Math.cos(angle);
      const yFlat = r * Math.sin(latitude);
      const zFlat = r * cl * Math.sin(angle);

      const y = yFlat * cosT - zFlat * sinT;
      const z = yFlat * sinT + zFlat * cosT;

      const persp = fov / (fov + z);
      const sx = cx + x * persp;
      const sy = cy + y * persp;

      // Depth drives both light and focus: far points are dimmer and softer,
      // which is what makes the cloud read as a volume.
      const depth = (z / shell + 1.6) / 3.2;
      const defocus = 1 + Math.abs(z) / shell * 0.55;
      const size = (1.1 + this.seed[i] * 1.5) * persp * defocus * 2.7;
      const alpha =
        eased *
        brightness *
        (0.12 + (1 - depth) * 0.42) *
        (0.5 + this.radius[i] * 0.4);

      if (alpha <= 0.004) continue;

      const ctx = z < 0 ? this.front : this.back;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(this.sprites[this.tint[i]], sx - size / 2, sy - size / 2, size, size);
    }

    this.back.globalAlpha = 1;
    this.front.globalAlpha = 1;
    this.back.globalCompositeOperation = 'source-over';
    this.front.globalCompositeOperation = 'source-over';
  }
}
