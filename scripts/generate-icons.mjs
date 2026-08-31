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

const GRADIENT = `
  <linearGradient id="g" x1="4" y1="60" x2="60" y2="4" gradientUnits="userSpaceOnUse">
    <stop stop-color="#FF8F7A"/>
    <stop offset="0.36" stop-color="#E26BD0"/>
    <stop offset="0.7" stop-color="#A97BFF"/>
    <stop offset="1" stop-color="#9AA6FF"/>
  </linearGradient>`;

const BANDS = `
  <g stroke="#0B0B12" stroke-width="6" stroke-linecap="round" opacity="0.92">
    <path d="M-6 26 L26 -6"/>
    <path d="M-6 48 L48 -6"/>
    <path d="M16 70 L70 16"/>
    <path d="M38 70 L70 38"/>
  </g>
  <g stroke="rgba(255,255,255,0.5)" stroke-width="1.6" stroke-linecap="round">
    <path d="M-6 34 L34 -6"/>
    <path d="M30 70 L70 30"/>
  </g>`;

/** Full-bleed rounded square, for regular icons and the Apple touch icon. */
function standardSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>${GRADIENT}<clipPath id="c"><rect x="4" y="4" width="56" height="56" rx="15"/></clipPath></defs>
    <rect width="64" height="64" rx="14" fill="#0B0B12"/>
    <g clip-path="url(#c)">
      <rect x="4" y="4" width="56" height="56" rx="15" fill="url(#g)"/>
      <g transform="translate(4 4) scale(0.875)">${BANDS}</g>
    </g>
  </svg>`;
}

/**
 * Maskable icons are cropped to a circle by the platform, so the mark is
 * inset well inside the 80% safe zone and the field extends to the edges.
 */
function maskableSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>${GRADIENT}<clipPath id="m"><rect x="2" y="2" width="60" height="60" rx="17"/></clipPath></defs>
    <rect width="64" height="64" fill="#0B0B12"/>
    <g transform="translate(13 13) scale(0.594)" clip-path="url(#m)">
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#g)"/>
      ${BANDS}
    </g>
  </svg>`;
}

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
