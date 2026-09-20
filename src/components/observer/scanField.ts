/**
 * The organic form, drawn inside one container.
 *
 * Everything is in the container's own coordinates: it has no idea where it
 * sits on the page and cannot draw outside itself. That constraint is what
 * makes it part of the interface rather than a layer over it.
 *
 * Metaballs by luminance. Soft sources are drawn white on an opaque black
 * field, blurred so neighbours overlap, then pushed through a hard contrast
 * curve so the overlap snaps into one silhouette. The membrane is that
 * silhouette minus a slightly smaller copy of itself, which gives a contour
 * that bulges and pinches with the form instead of an outline stroked around
 * it. Black is nothing here: the canvas is composited with `screen`.
 *
 * `contrast()` works on colour and leaves alpha untouched, which is why the
 * sources have to sit on black rather than on transparency. Thresholding an
 * alpha gradient does nothing at all and yields one soft grey disc.
 */

interface Source {
  angle: number;
  speed: number;
  radius: number;
  size: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const SCALE = 0.4;
const SOURCE_COUNT = 8;
const PARTICLE_COUNT = 54;

function noise(x: number): number {
  return (
    Math.sin(x) * 0.5 + Math.sin(x * 2.13 + 1.7) * 0.3 + Math.sin(x * 4.7 + 0.3) * 0.2
  );
}

export class ScanFieldRenderer {
  private ctx: CanvasRenderingContext2D;
  private blobCanvas: HTMLCanvasElement;
  private blobCtx: CanvasRenderingContext2D;
  private shapeCanvas: HTMLCanvasElement;
  private shapeCtx: CanvasRenderingContext2D;

  private width = 0;
  private height = 0;
  private dpr = 1;

  private sources: Source[] = [];
  private particles: Particle[] = [];

  private intensity = 0;
  private mode: 'occupy' | 'mark' = 'occupy';

  private frame = 0;
  private running = false;
  private time = 0;
  private reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, reducedMotion = false) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
    this.reducedMotion = reducedMotion;

    this.blobCanvas = document.createElement('canvas');
    const blobCtx = this.blobCanvas.getContext('2d');
    if (!blobCtx) throw new Error('No 2D context');
    this.blobCtx = blobCtx;

    this.shapeCanvas = document.createElement('canvas');
    const shapeCtx = this.shapeCanvas.getContext('2d');
    if (!shapeCtx) throw new Error('No 2D context');
    this.shapeCtx = shapeCtx;

    for (let i = 0; i < SOURCE_COUNT; i += 1) {
      this.sources.push({
        angle: (i / SOURCE_COUNT) * Math.PI * 2,
        speed: 0.3 + (i % 4) * 0.14,
        radius: 0.1 + (i % 5) * 0.05,
        size: 0.09 + (i % 3) * 0.035,
        phase: i * 1.7,
      });
    }
  }

  setEnvelope(intensity: number, mode: 'occupy' | 'mark'): void {
    this.intensity = intensity;
    this.mode = mode;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = width;
    this.height = height;

    const canvas = this.ctx.canvas;
    canvas.width = Math.max(1, Math.round(width * this.dpr));
    canvas.height = Math.max(1, Math.round(height * this.dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    this.blobCanvas.width = Math.max(1, Math.round(width * SCALE));
    this.blobCanvas.height = Math.max(1, Math.round(height * SCALE));
    this.shapeCanvas.width = this.blobCanvas.width;
    this.shapeCanvas.height = this.blobCanvas.height;

    this.particles.length = 0;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** The body, centred in its own box and scaled to it. */
  private drawBody(intensity: number): void {
    const ctx = this.blobCtx;
    const w = this.blobCanvas.width;
    const h = this.blobCanvas.height;
    if (w < 2 || h < 2) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const unit = Math.min(w, h);
    const spread = 0.45 + intensity * 0.9;

    for (const source of this.sources) {
      const wobble = noise(this.time * source.speed + source.phase);
      const angle = source.angle + this.time * source.speed * 0.6;
      const radius = source.radius * unit * spread * (1 + wobble * 0.5);
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius * 0.82;
      const size = source.size * unit * spread * (1.1 + wobble * 0.35);
      if (size <= 0.5) continue;

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, size);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }

    const shape = this.shapeCtx;
    shape.globalCompositeOperation = 'source-over';
    shape.filter = `blur(${2.5 + intensity * 3}px) contrast(30)`;
    shape.drawImage(this.blobCanvas, 0, 0);

    const inset = 1 + intensity * 2;
    shape.globalCompositeOperation = 'difference';
    shape.filter = `blur(${2.5 + intensity * 3}px) contrast(30)`;
    shape.drawImage(this.blobCanvas, -inset, -inset, w + inset * 2, h + inset * 2);

    // Bone, leaning towards the signal only at the peak of a pulse.
    shape.globalCompositeOperation = 'multiply';
    shape.filter = 'none';
    const heat = Math.max(0, intensity - 0.62) / 0.38;
    shape.fillStyle = `rgb(${Math.round(212 + heat * 28)},${Math.round(
      206 - heat * 52,
    )},${Math.round(192 - heat * 104)})`;
    shape.fillRect(0, 0, w, h);
    shape.globalCompositeOperation = 'source-over';

    const main = this.ctx;
    main.save();
    main.scale(this.dpr, this.dpr);
    main.globalCompositeOperation = 'lighter';
    main.globalAlpha = Math.min(1, 0.45 + intensity * 0.55);
    main.filter = 'none';
    main.drawImage(this.shapeCanvas, 0, 0, this.width, this.height);
    main.globalCompositeOperation = 'source-over';
    main.globalAlpha = 1;
    main.restore();
  }

  private drawParticles(intensity: number): void {
    const cx = this.width / 2;
    const cy = this.height / 2;

    while (this.particles.length < PARTICLE_COUNT) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.min(this.width, this.height) * (0.3 + Math.random() * 0.5);
      this.particles.push({
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance,
        vx: 0,
        vy: 0,
        life: Math.random(),
      });
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.lineWidth = 1;

    for (const particle of this.particles) {
      const dx = cx - particle.x;
      const dy = cy - particle.y;
      const distance = Math.max(12, Math.hypot(dx, dy));
      const pull = (intensity * 120) / distance;

      particle.vx += (dx / distance) * pull * 0.02 - (dy / distance) * pull * 0.013;
      particle.vy += (dy / distance) * pull * 0.02 + (dx / distance) * pull * 0.013;
      particle.vx *= 0.94;
      particle.vy *= 0.94;

      const px = particle.x;
      const py = particle.y;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.006;

      if (particle.life <= 0 || distance < 14) {
        const angle = Math.random() * Math.PI * 2;
        const d = Math.min(this.width, this.height) * (0.4 + Math.random() * 0.45);
        particle.x = cx + Math.cos(angle) * d;
        particle.y = cy + Math.sin(angle) * d;
        particle.vx = 0;
        particle.vy = 0;
        particle.life = 1;
      }

      const alpha = Math.min(1, particle.life) * intensity * 0.45;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The edge treatment. In `mark` mode this is all there is: a bar that runs
   * the height of the region and a scan line travelling down it, so a row can
   * show it is being worked on without anything covering its content.
   */
  private drawEdge(intensity: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.fillStyle = `rgba(255,255,255,${0.1 * intensity})`;
    ctx.fillRect(0, 0, 2, this.height);

    const travel = (this.time * 0.35) % 1;
    const y = travel * this.height;
    const bar = Math.max(12, this.height * 0.22);
    ctx.fillStyle = `rgba(255,255,255,${0.8 * intensity})`;
    ctx.fillRect(0, y - bar / 2, 2, bar);

    // A tick where the scan currently is, reaching a little into the region.
    ctx.strokeStyle = `rgba(255,255,255,${0.25 * intensity})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(Math.min(22, this.width * 0.25), y);
    ctx.stroke();
    ctx.restore();
  }

  /** Corner brackets on two opposite corners, so the frame stays incomplete. */
  private drawBrackets(intensity: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const jitter = noise(this.time * 0.8) * 2 * intensity;
    const arm = Math.min(20, this.width * 0.1);
    const pad = 4;

    ctx.strokeStyle = `rgba(255,255,255,${0.45 * intensity})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, pad + arm + jitter);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad + arm, pad);
    ctx.moveTo(this.width - pad, this.height - pad - arm - jitter);
    ctx.lineTo(this.width - pad, this.height - pad);
    ctx.lineTo(this.width - pad - arm, this.height - pad);
    ctx.stroke();
    ctx.restore();
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const intensity = Math.min(1, this.intensity);
    if (intensity <= 0.002 || this.width < 2) {
      this.particles.length = 0;
      return;
    }

    this.time += 0.016;

    if (this.mode === 'mark') {
      this.drawEdge(intensity);
      return;
    }

    if (this.reducedMotion) {
      this.drawBrackets(intensity);
      return;
    }

    this.drawBrackets(intensity);
    this.drawParticles(intensity);
    this.drawBody(intensity);
  };
}
