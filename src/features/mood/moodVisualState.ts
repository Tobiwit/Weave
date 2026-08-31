import type { MoodVisualState, Playlist, SongProfile } from '../../types';

/**
 * The neutral environment used on Analyze: atmospheric enough to establish the
 * brand, deliberately low-information so it implies no particular mood.
 */
export const NEUTRAL_MOOD: MoodVisualState = {
  hueA: 236,
  hueB: 262,
  warmth: 0.12,
  density: 0.4,
  softness: 0.78,
  curvature: 0.45,
  motion: 0.3,
  contrast: 0.32,
  turbulence: 0.25,
};

type MoodPreset = Partial<MoodVisualState>;

/**
 * Controlled visual dimensions per mood. Every song stays inside the same
 * material system; only these dials move.
 */
const MOOD_PRESETS: Record<string, MoodPreset> = {
  dreamy: {
    hueA: 238, hueB: 276, warmth: 0.16, density: 0.36, softness: 0.94,
    curvature: 0.62, motion: 0.22, contrast: 0.26, turbulence: 0.2,
  },
  bittersweet: {
    hueA: 258, hueB: 332, warmth: 0.44, density: 0.52, softness: 0.72,
    curvature: 0.55, motion: 0.34, contrast: 0.44, turbulence: 0.38,
  },
  euphoric: {
    hueA: 288, hueB: 342, warmth: 0.62, density: 0.74, softness: 0.5,
    curvature: 0.44, motion: 0.72, contrast: 0.68, turbulence: 0.52,
  },
  melancholic: {
    hueA: 224, hueB: 250, warmth: 0.08, density: 0.3, softness: 0.86,
    curvature: 0.7, motion: 0.16, contrast: 0.2, turbulence: 0.18,
  },
  playful: {
    hueA: 296, hueB: 20, warmth: 0.66, density: 0.6, softness: 0.55,
    curvature: 0.78, motion: 0.62, contrast: 0.58, turbulence: 0.62,
  },
  confident: {
    hueA: 268, hueB: 322, warmth: 0.5, density: 0.58, softness: 0.42,
    curvature: 0.34, motion: 0.46, contrast: 0.72, turbulence: 0.24,
  },
  sensual: {
    hueA: 300, hueB: 348, warmth: 0.58, density: 0.5, softness: 0.8,
    curvature: 0.66, motion: 0.28, contrast: 0.42, turbulence: 0.3,
  },
  calm: {
    hueA: 220, hueB: 244, warmth: 0.14, density: 0.26, softness: 0.9,
    curvature: 0.5, motion: 0.14, contrast: 0.18, turbulence: 0.12,
  },
  anxious: {
    hueA: 246, hueB: 288, warmth: 0.2, density: 0.66, softness: 0.4,
    curvature: 0.3, motion: 0.6, contrast: 0.56, turbulence: 0.82,
  },
  cathartic: {
    hueA: 252, hueB: 356, warmth: 0.54, density: 0.7, softness: 0.6,
    curvature: 0.58, motion: 0.6, contrast: 0.66, turbulence: 0.58,
  },
  defiant: {
    hueA: 262, hueB: 14, warmth: 0.5, density: 0.72, softness: 0.36,
    curvature: 0.26, motion: 0.66, contrast: 0.78, turbulence: 0.5,
  },
  romantic: {
    hueA: 286, hueB: 340, warmth: 0.6, density: 0.44, softness: 0.84,
    curvature: 0.68, motion: 0.26, contrast: 0.36, turbulence: 0.22,
  },
  angry: {
    hueA: 258, hueB: 6, warmth: 0.56, density: 0.8, softness: 0.3,
    curvature: 0.22, motion: 0.78, contrast: 0.82, turbulence: 0.74,
  },
  nostalgic: {
    hueA: 250, hueB: 30, warmth: 0.52, density: 0.42, softness: 0.82,
    curvature: 0.64, motion: 0.24, contrast: 0.34, turbulence: 0.28,
  },
};

/** Secondary dials nudged by texture and energy words rather than the main mood. */
const TEXTURE_HINTS: Record<string, MoodPreset> = {
  polished: { softness: 0.46, contrast: 0.62, turbulence: 0.18 },
  glossy: { softness: 0.44, contrast: 0.66, turbulence: 0.16 },
  raw: { softness: 0.34, turbulence: 0.7, contrast: 0.6 },
  electronic: { curvature: 0.32, contrast: 0.6 },
  acoustic: { warmth: 0.6, curvature: 0.72, turbulence: 0.34 },
  organic: { warmth: 0.56, curvature: 0.78, turbulence: 0.4 },
  atmospheric: { softness: 0.92, density: 0.34, motion: 0.2 },
  bright: { contrast: 0.7, warmth: 0.5 },
  dark: { contrast: 0.22, warmth: 0.06 },
  warm: { warmth: 0.72 },
  cold: { warmth: 0.04 },
  maximal: { density: 0.86, motion: 0.68 },
  minimal: { density: 0.22, motion: 0.16 },
  dance: { motion: 0.7, density: 0.68 },
  ambient: { softness: 0.94, motion: 0.14, density: 0.24 },
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Hues are circular, so blending has to take the short way round. */
function mixHue(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

export function blendMoodState(
  a: MoodVisualState,
  b: MoodVisualState,
  t: number,
): MoodVisualState {
  const k = clamp01(t);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    hueA: mixHue(a.hueA, b.hueA, k),
    hueB: mixHue(a.hueB, b.hueB, k),
    warmth: lerp(a.warmth, b.warmth),
    density: lerp(a.density, b.density),
    softness: lerp(a.softness, b.softness),
    curvature: lerp(a.curvature, b.curvature),
    motion: lerp(a.motion, b.motion),
    contrast: lerp(a.contrast, b.contrast),
    turbulence: lerp(a.turbulence, b.turbulence),
  };
}

function applyPreset(
  base: MoodVisualState,
  preset: MoodPreset,
  weight: number,
): MoodVisualState {
  const next = { ...base };
  for (const key of Object.keys(preset) as (keyof MoodVisualState)[]) {
    const target = preset[key];
    if (target === undefined) continue;
    next[key] =
      key === 'hueA' || key === 'hueB'
        ? mixHue(base[key], target, weight)
        : base[key] + (target - base[key]) * weight;
  }
  return next;
}

/** Stable small offset per song so two similar songs still feel individual. */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function normalise(state: MoodVisualState): MoodVisualState {
  return {
    hueA: (state.hueA + 360) % 360,
    hueB: (state.hueB + 360) % 360,
    warmth: clamp01(state.warmth),
    density: clamp01(state.density),
    softness: clamp01(state.softness),
    curvature: clamp01(state.curvature),
    motion: clamp01(state.motion),
    contrast: clamp01(state.contrast),
    turbulence: clamp01(state.turbulence),
  };
}

/**
 * Maps an interpreted Song Profile onto the background visual dials.
 * Deterministic, so similar songs produce visually related environments.
 */
export function moodStateFromProfile(profile: SongProfile): MoodVisualState {
  let state: MoodVisualState = { ...NEUTRAL_MOOD };

  if (profile.mood) {
    const preset = MOOD_PRESETS[profile.mood.toLowerCase()];
    if (preset) state = applyPreset(state, preset, 0.92);
  }

  const words = [
    ...profile.vibes,
    ...profile.genres,
    ...profile.communityTags.slice(0, 8),
    ...profile.manualTags,
  ].map((w) => w.toLowerCase());

  for (const word of words) {
    for (const [hint, preset] of Object.entries(TEXTURE_HINTS)) {
      if (word.includes(hint)) state = applyPreset(state, preset, 0.22);
    }
  }

  if (typeof profile.energy === 'number') {
    state.motion = state.motion * 0.55 + profile.energy * 0.55;
    state.density = state.density * 0.6 + profile.energy * 0.5;
  }
  if (typeof profile.intensity === 'number') {
    state.contrast = state.contrast * 0.6 + profile.intensity * 0.5;
  }
  if (typeof profile.brightness === 'number') {
    state.warmth = state.warmth * 0.7 + profile.brightness * 0.4;
  }
  if (typeof profile.acousticness === 'number') {
    state.curvature = state.curvature * 0.7 + profile.acousticness * 0.45;
  }

  const seed = hashSeed(profile.songId);
  state.hueA += (seed - 0.5) * 12;
  state.hueB += (seed - 0.5) * 16;
  state.curvature += (seed - 0.5) * 0.1;

  return normalise(state);
}

/** A playlist environment derives from its own descriptors, not from a song. */
export function moodStateFromPlaylist(playlist: Playlist): MoodVisualState {
  let state: MoodVisualState = { ...NEUTRAL_MOOD };
  const words = [...playlist.keywords, playlist.description ?? '']
    .join(' ')
    .toLowerCase();

  for (const [mood, preset] of Object.entries(MOOD_PRESETS)) {
    if (words.includes(mood)) state = applyPreset(state, preset, 0.55);
  }
  for (const [hint, preset] of Object.entries(TEXTURE_HINTS)) {
    if (words.includes(hint)) state = applyPreset(state, preset, 0.3);
  }

  const seed = hashSeed(playlist.id + playlist.name);
  state.hueA += (seed - 0.5) * 26;
  state.hueB += (seed - 0.5) * 34;
  state.curvature += (seed - 0.5) * 0.24;
  state.density += (seed - 0.5) * 0.16;
  return normalise(state);
}
