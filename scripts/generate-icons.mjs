/**
 * Renders the PWA icon set from the brand mark.
 *
 * Run with `npm run icons` after changing public/icons/mark.svg.
 * Uses sharp, which is already present as a transitive dependency.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'public', 'icons');

/*
 * The mark: five concentric half circles fanned at rest, on a near-black tile
 * with the app's glow rising from the foot of it. Kept in step with
 * `OrbitWeave` (radii, rest angles, ramp colours).
 */
const RADII = [9, 17, 25, 33, 41];
const REST = [0, 34, 68, 102, 136];
const RAMP = ['#7de2fa', '#72ece4', '#89efca', '#cbf871', '#f5f031'];

function arcs(stroke) {
  return RADII.map(
    (r, i) =>
      `<path d="M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0" transform="rotate(${REST[i] + 180})" stroke="${RAMP[i]}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>`,
  ).join('');
}

const GLOW = `
  <radialGradient id="glow" cx="0.5" cy="1.08" r="0.75">
    <stop offset="0" stop-color="#107460" stop-opacity="0.95"/>
    <stop offset="0.55" stop-color="#0b3a3a" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#101315" stop-opacity="0"/>
  </radialGradient>`;

/** Full-bleed rounded square, for regular icons and the Apple touch icon. */
function standardSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>${GLOW}</defs>
    <rect width="64" height="64" rx="14" fill="#101315"/>
    <rect width="64" height="64" rx="14" fill="url(#glow)"/>
    <g transform="translate(32 33) scale(0.56)">${arcs(5.4)}</g>
  </svg>`;
}

/**
 * Maskable icons are cropped to a circle by the platform, so the mark is
 * inset well inside the 80% safe zone and the field extends to the edges.
 */
function maskableSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>${GLOW}</defs>
    <rect width="64" height="64" fill="#101315"/>
    <rect width="64" height="64" fill="url(#glow)"/>
    <g transform="translate(32 33) scale(0.42)">${arcs(5.4)}</g>
  </svg>`;
}

/** The plain mark, transparent, for the browser tab. */
function markSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="64" height="64">${arcs(6)}</svg>`;
}

await writeFile(resolve(out, 'mark.svg'), `${markSvg()}
`);

const TARGETS = [
  { name: 'icon-192.png', size: 192, svg: standardSvg() },
  { name: 'icon-512.png', size: 512, svg: standardSvg() },
  { name: 'icon-maskable-512.png', size: 512, svg: maskableSvg() },
  { name: 'apple-touch-icon.png', size: 180, svg: standardSvg() },
  { name: 'favicon-32.png', size: 32, svg: standardSvg() },
];

await mkdir(out, { recursive: true });

for (const target of TARGETS) {
  const buffer = await sharp(Buffer.from(target.svg))
    .resize(target.size, target.size)
    .png()
    .toBuffer();
  await writeFile(resolve(out, target.name), buffer);
  console.log(`wrote ${target.name} (${target.size}px)`);
}
