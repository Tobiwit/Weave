import { db } from '../db/weaveDb';
import { readSetting, writeSetting } from '../db/repositories';
import type { Playlist, SongProfile } from '../types';
import { CATALOGUE } from './mockCatalogue';

const SEED_KEY = 'seed.version';
const SEED_VERSION = 1;

interface PlaylistSeed {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  songIds: string[];
}

const PLAYLIST_SEEDS: PlaylistSeed[] = [
  {
    id: 'pl_lipgloss',
    name: 'lipgloss',
    description: 'getting ready to go out, mirror lit, nothing subtle',
    keywords: [
      'girly pop',
      'glossy',
      'feminine',
      'bratty',
      'confident',
      'fun',
      'getting ready to go out',
    ],
    songIds: ['sng_murder', 'sng_pinkpony', 'sng_badidea', 'sng_padam'],
  },
  {
    id: 'pl_moonflower',
    name: 'moonflower',
    description: 'a warm dark room, autumn, candles, old records',
    keywords: [
      'dreamy',
      'witchy',
      'warm',
      'nostalgic',
      'organic',
      'nighttime',
      '70s',
      'soft rock',
      'female vocals',
    ],
    songIds: ['sng_dreams', 'sng_fade', 'sng_hounds'],
  },
  {
    id: 'pl_lostinfeels',
    name: 'lost in feels',
    description: 'for when it needs to get worse before it gets better',
    keywords: ['emotional', 'longing', 'heartbreak', 'dramatic', 'cathartic'],
    songIds: ['sng_videogames', 'sng_cranes', 'sng_kyoto'],
  },
  {
    id: 'pl_quirky',
    name: 'quirky',
    description: 'songs that are in on their own joke',
    keywords: ['weird', 'camp', 'playful', 'hyperpop', 'experimental'],
    songIds: ['sng_chaise', 'sng_vondutch'],
  },
  {
    id: 'pl_auxon',
    name: 'aux on',
    description: 'nobody in the car will complain about this',
    keywords: ['easy', 'good mood', 'accessible', 'indie pop', 'casual'],
    songIds: ['sng_electricfeel', 'sng_redbone', 'sng_sweetdreams'],
  },
];

/** Pre-generated profiles so seeded playlists have real shape on first launch. */
function profileFromCatalogue(entry: (typeof CATALOGUE)[number]): SongProfile {
  const now = Date.now();
  const measured: string[] = [];
  if (typeof entry.bpm === 'number') measured.push('bpm');
  measured.push('energy', 'brightness', 'danceability', 'acousticness');

  return {
    songId: entry.song.id,
    genres: entry.genres,
    communityTags: entry.tags,
    themes: entry.themes,
    vibes: entry.vibes,
    mood: entry.mood.charAt(0).toUpperCase() + entry.mood.slice(1),
    energy: entry.energy,
    intensity: entry.intensity,
    brightness: entry.brightness,
    danceability: entry.danceability,
    acousticness: entry.acousticness,
    bpm: entry.bpm,
    measuredFields: measured,
    manualTags: [],
    removedTags: [],
    sources: [
      { kind: 'metadata', provider: 'mock', ok: true, at: now },
      { kind: 'community', provider: 'mock', ok: true, at: now },
      { kind: 'lyrics', provider: 'mock', ok: true, at: now },
      { kind: 'audio', provider: 'mock', ok: true, at: now },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Seeds the development library once.
 *
 * Runs only when the database is untouched, so it can never overwrite a real
 * library. Embeddings are intentionally left empty here: they are computed
 * lazily on first use, keeping app start free of model loading.
 */
export async function ensureSeedData(): Promise<void> {
  const seeded = await readSetting<number>(SEED_KEY, 0);
  if (seeded >= SEED_VERSION) return;

  const existingPlaylists = await db.playlists.count();
  if (existingPlaylists > 0) {
    await writeSetting(SEED_KEY, SEED_VERSION);
    return;
  }

  const now = Date.now();

  await db.songs.bulkPut(
    CATALOGUE.map((entry) => ({
      ...entry.song,
      addedAt: now,
      lastSeenAt: now - CATALOGUE.indexOf(entry) * 1000,
    })),
  );

  await db.songProfiles.bulkPut(CATALOGUE.map(profileFromCatalogue));

  const playlists: Playlist[] = PLAYLIST_SEEDS.map((seed, index) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    keywords: seed.keywords,
    songIds: seed.songIds,
    createdAt: now - index * 1000,
    updatedAt: now - index * 1000,
  }));
  await db.playlists.bulkPut(playlists);

  await writeSetting(SEED_KEY, SEED_VERSION);
}
