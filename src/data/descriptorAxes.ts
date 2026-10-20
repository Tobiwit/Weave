import type { AxisId } from '../features/song/axes';

/**
 * Where each descriptor sits on the eight scales, 0 at the low word and 1 at
 * the high one.
 *
 * This is the bridge between the vocabulary and the Weave. It runs both ways:
 * a song read as mostly Melancholic and Intimate is placed dark and vulnerable,
 * and a song measured as dark and still has Euphoric pushed down its ranking.
 *
 * Only the axes a descriptor genuinely says something about are given. Retro
 * says nothing about how heavy a song is, so it does not pretend to. Values are
 * hand-set and coarse on purpose; their job is direction, not precision.
 *
 * Reminder of the poles: energy calm-energetic, weight light-heavy, mood
 * bright-dark, emotion controlled-vulnerable, presence quiet-loud, finish
 * raw-elegant, movement still-danceable, sound organic-electric.
 */
export const DESCRIPTOR_AXES: Record<string, Partial<Record<AxisId, number>>> = {
  /* mood */
  euphoric: { energy: 0.85, mood: 0.1, movement: 0.8, presence: 0.75 },
  melancholic: { energy: 0.25, mood: 0.8, emotion: 0.75, weight: 0.6, movement: 0.25 },
  bittersweet: { mood: 0.6, emotion: 0.7, energy: 0.45 },
  angry: { energy: 0.9, mood: 0.8, weight: 0.85, presence: 0.9, emotion: 0.35, finish: 0.2 },
  dreamy: { energy: 0.3, presence: 0.3, weight: 0.3, finish: 0.65 },
  calm: { energy: 0.1, presence: 0.15, weight: 0.2, movement: 0.2 },
  playful: { energy: 0.65, mood: 0.15, weight: 0.2, movement: 0.65, emotion: 0.3 },
  sensual: { energy: 0.45, mood: 0.6, movement: 0.6, finish: 0.7, emotion: 0.55 },
  anxious: { energy: 0.65, mood: 0.75, emotion: 0.7 },
  cathartic: { energy: 0.75, presence: 0.8, weight: 0.75, emotion: 0.85 },
  defiant: { energy: 0.75, mood: 0.6, emotion: 0.2, presence: 0.75 },
  romantic: { mood: 0.3, emotion: 0.65, energy: 0.4, finish: 0.7 },
  nostalgic: { mood: 0.55, emotion: 0.6, energy: 0.4 },
  triumphant: { energy: 0.85, mood: 0.15, presence: 0.85, emotion: 0.2, weight: 0.6 },

  /* theme: what a song is about leans on how it feels, never on how it sounds */
  heartbreak: { mood: 0.75, emotion: 0.85 },
  longing: { mood: 0.6, emotion: 0.8 },
  desire: { emotion: 0.55, movement: 0.55 },
  confidence: { emotion: 0.15, mood: 0.3 },
  nostalgia: { mood: 0.55, emotion: 0.6 },
  freedom: { mood: 0.2, energy: 0.65 },
  loneliness: { mood: 0.8, emotion: 0.85, energy: 0.25 },
  friendship: { mood: 0.2, emotion: 0.45 },
  escapism: { mood: 0.4 },
  'self-worth': { emotion: 0.25, mood: 0.3 },
  jealousy: { mood: 0.7, emotion: 0.6 },
  celebration: { mood: 0.1, energy: 0.8, movement: 0.75 },
  regret: { mood: 0.75, emotion: 0.8 },
  obsession: { mood: 0.7, emotion: 0.65 },
  'growing-up': { emotion: 0.6, mood: 0.45 },
  nightlife: { mood: 0.6, movement: 0.75, energy: 0.7, sound: 0.7 },

  /* texture */
  polished: { finish: 0.85 },
  raw: { finish: 0.1 },
  electronic: { sound: 0.9 },
  acoustic: { sound: 0.1, presence: 0.3 },
  atmospheric: { presence: 0.35, energy: 0.3, finish: 0.65 },
  bright: { mood: 0.1 },
  dark: { mood: 0.9 },
  warm: { mood: 0.35, sound: 0.35 },
  cold: { mood: 0.65, sound: 0.75, emotion: 0.25 },
  maximal: { presence: 0.9, weight: 0.75 },
  minimal: { presence: 0.2, weight: 0.2 },
  orchestral: { sound: 0.1, finish: 0.9, weight: 0.65 },
  distorted: { finish: 0.1, weight: 0.85, presence: 0.85 },
  groovy: { movement: 0.85 },

  /* energy */
  'high-energy': { energy: 0.9, presence: 0.75 },
  'mid-energy': { energy: 0.5 },
  'low-energy': { energy: 0.1, presence: 0.25 },
  building: { energy: 0.6 },

  /* vibe */
  glossy: { finish: 0.9, sound: 0.7, mood: 0.25 },
  feminine: { weight: 0.3 },
  camp: { emotion: 0.3, mood: 0.15 },
  weird: { finish: 0.35 },
  witchy: { mood: 0.75 },
  nocturnal: { mood: 0.7, energy: 0.4 },
  cinematic: { presence: 0.7, finish: 0.8, weight: 0.6 },
  intimate: { presence: 0.15, emotion: 0.8, weight: 0.3 },
  anthemic: { presence: 0.9, energy: 0.8 },
  organic: { sound: 0.1 },
  'euphoric-dance': { movement: 0.95, energy: 0.85, sound: 0.75 },
  melodramatic: { emotion: 0.8, presence: 0.75 },
  'laid-back': { energy: 0.2, movement: 0.4, weight: 0.2 },
  hypnotic: { movement: 0.6, energy: 0.5 },
  singalong: { presence: 0.65, mood: 0.3 },
};

/**
 * Axes lyrics are allowed to speak to. Words can tell you a song is dark and
 * exposed; they cannot tell you it is loud, electric or danceable.
 */
export const LYRIC_AXES: AxisId[] = ['mood', 'emotion'];
