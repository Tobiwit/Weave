import type { Song } from '../types';

/**
 * Development catalogue.
 *
 * Every screen must be demonstrable with no network at all, so this seed
 * carries the signals the live providers would otherwise fetch: metadata,
 * community tags, and a short original lyric-style passage. No real lyrics are
 * reproduced anywhere in this file.
 */
export interface CatalogueEntry {
  song: Song;
  genres: string[];
  tags: string[];
  /** Original placeholder text standing in for retrieved lyrics. */
  lyricSketch: string;
  bpm?: number;
  /** Hand-authored profile fields so seeded playlists have shape immediately. */
  mood: string;
  vibes: string[];
  themes: string[];
  energy: number;
  intensity: number;
  brightness: number;
  danceability: number;
  acousticness: number;
}

export const CATALOGUE: CatalogueEntry[] = [
  {
    song: {
      id: 'sng_murder',
      title: 'Murder on the Dancefloor',
      artist: 'Sophie Ellis-Bextor',
      album: 'Read My Lips',
      year: 2001,
      source: 'mock',
    },
    genres: ['disco', 'dance-pop', 'nu-disco'],
    tags: ['dance', 'female vocalists', 'pop', 'catchy', '00s', 'glossy', 'club'],
    lyricSketch:
      'a night that will not end, spinning under the lights, refusing to leave the floor to anyone else',
    bpm: 117,
    mood: 'confident',
    vibes: ['Glossy', 'Feminine', 'Dancefloor', 'Singalong'],
    themes: ['Confidence', 'Nightlife', 'Celebration'],
    energy: 0.82,
    intensity: 0.6,
    brightness: 0.78,
    danceability: 0.9,
    acousticness: 0.1,
  },
  {
    song: {
      id: 'sng_dreams',
      title: 'Dreams',
      artist: 'Fleetwood Mac',
      album: 'Rumours',
      year: 1977,
      source: 'mock',
    },
    genres: ['soft rock', 'classic rock', 'folk rock'],
    tags: ['70s', 'female vocalists', 'mellow', 'nostalgic', 'organic', 'warm'],
    lyricSketch:
      'quiet advice offered to someone leaving, rain washing a road clean, the calm of already knowing how it ends',
    bpm: 120,
    mood: 'nostalgic',
    vibes: ['Organic', 'Retro', 'Warm', 'Nocturnal'],
    themes: ['Heartbreak', 'Freedom', 'Regret'],
    energy: 0.44,
    intensity: 0.36,
    brightness: 0.5,
    danceability: 0.52,
    acousticness: 0.62,
  },
  {
    song: {
      id: 'sng_fade',
      title: 'Fade Into You',
      artist: 'Mazzy Star',
      album: 'So Tonight That I Might See',
      year: 1993,
      source: 'mock',
    },
    genres: ['dream pop', 'slowcore', 'indie'],
    tags: ['dreamy', 'melancholy', '90s', 'female vocalists', 'atmospheric', 'slow'],
    lyricSketch:
      'watching someone from very close and still not reaching them, light through a curtain, time slowing to nothing',
    mood: 'dreamy',
    vibes: ['Intimate', 'Organic', 'Nocturnal', 'Hypnotic'],
    themes: ['Longing', 'Loneliness'],
    energy: 0.2,
    intensity: 0.28,
    brightness: 0.32,
    danceability: 0.24,
    acousticness: 0.78,
  },
  {
    song: {
      id: 'sng_pinkpony',
      title: 'Pink Pony Club',
      artist: 'Chappell Roan',
      album: 'The Rise and Fall of a Midwest Princess',
      year: 2020,
      source: 'mock',
    },
    genres: ['pop', 'synthpop', 'dance-pop'],
    tags: ['camp', 'queer', 'female vocalists', 'anthem', 'theatrical', 'club'],
    lyricSketch:
      'leaving a small town for a stage in a loud city, a mother on the phone, choosing joy anyway',
    bpm: 132,
    mood: 'euphoric',
    vibes: ['Camp', 'Anthemic', 'Feminine', 'Dramatic'],
    themes: ['Freedom', 'Self-worth', 'Nightlife'],
    energy: 0.86,
    intensity: 0.72,
    brightness: 0.8,
    danceability: 0.78,
    acousticness: 0.12,
  },
  {
    song: {
      id: 'sng_cranes',
      title: 'Cranes in the Sky',
      artist: 'Solange',
      album: 'A Seat at the Table',
      year: 2016,
      source: 'mock',
    },
    genres: ['neo-soul', 'r&b', 'art pop'],
    tags: ['soulful', 'introspective', 'female vocalists', 'smooth', 'sad'],
    lyricSketch:
      'trying every distraction in turn and finding the feeling still there in the morning',
    mood: 'melancholic',
    vibes: ['Intimate', 'Cinematic', 'Organic'],
    themes: ['Loneliness', 'Escapism', 'Self-worth'],
    energy: 0.32,
    intensity: 0.42,
    brightness: 0.4,
    danceability: 0.4,
    acousticness: 0.52,
  },
  {
    song: {
      id: 'sng_videogames',
      title: 'Video Games',
      artist: 'Lana Del Rey',
      album: 'Born to Die',
      year: 2011,
      source: 'mock',
    },
    genres: ['baroque pop', 'dream pop', 'indie pop'],
    tags: ['melancholy', 'cinematic', 'female vocalists', 'nostalgic', 'sad', 'slow'],
    lyricSketch:
      'an ordinary evening made enormous by devotion, waiting by a window for headlights',
    mood: 'bittersweet',
    vibes: ['Cinematic', 'Dramatic', 'Retro', 'Intimate'],
    themes: ['Longing', 'Desire', 'Obsession'],
    energy: 0.26,
    intensity: 0.5,
    brightness: 0.3,
    danceability: 0.3,
    acousticness: 0.55,
  },
  {
    song: {
      id: 'sng_badidea',
      title: 'bad idea right?',
      artist: 'Olivia Rodrigo',
      album: 'GUTS',
      year: 2023,
      source: 'mock',
    },
    genres: ['pop rock', 'alt-pop', 'pop punk'],
    tags: ['bratty', 'female vocalists', 'fun', 'guitar', 'messy', '2020s'],
    lyricSketch:
      'talking yourself into the exact mistake you already decided to make, laughing about it in the car',
    bpm: 130,
    mood: 'playful',
    vibes: ['Feminine', 'Singalong', 'Camp'],
    themes: ['Desire', 'Regret', 'Confidence'],
    energy: 0.8,
    intensity: 0.66,
    brightness: 0.72,
    danceability: 0.68,
    acousticness: 0.18,
  },
  {
    song: {
      id: 'sng_sweetdreams',
      title: 'Sweet Dreams (Are Made of This)',
      artist: 'Eurythmics',
      album: 'Sweet Dreams (Are Made of This)',
      year: 1983,
      source: 'mock',
    },
    genres: ['synthpop', 'new wave'],
    tags: ['80s', 'electronic', 'cold', 'iconic', 'dark', 'hypnotic'],
    lyricSketch:
      'a flat observation about what people want from each other, repeated until it turns into a chant',
    bpm: 126,
    mood: 'defiant',
    vibes: ['Hypnotic', 'Retro', 'Nocturnal', 'Anthemic'],
    themes: ['Desire', 'Freedom'],
    energy: 0.68,
    intensity: 0.6,
    brightness: 0.42,
    danceability: 0.74,
    acousticness: 0.08,
  },
  {
    song: {
      id: 'sng_kyoto',
      title: 'Kyoto',
      artist: 'Phoebe Bridgers',
      album: 'Punisher',
      year: 2020,
      source: 'mock',
    },
    genres: ['indie rock', 'indie folk'],
    tags: ['indie', 'female vocalists', 'bittersweet', 'horns', 'cathartic'],
    lyricSketch:
      'being somewhere remarkable and wishing you were home, a phone call you did not want to take',
    mood: 'cathartic',
    vibes: ['Anthemic', 'Organic', 'Dramatic'],
    themes: ['Escapism', 'Regret', 'Growing up'],
    energy: 0.62,
    intensity: 0.64,
    brightness: 0.58,
    danceability: 0.44,
    acousticness: 0.42,
  },
  {
    song: {
      id: 'sng_padam',
      title: 'Padam Padam',
      artist: 'Kylie Minogue',
      album: 'Tension',
      year: 2023,
      source: 'mock',
    },
    genres: ['dance-pop', 'electropop', 'house'],
    tags: ['club', 'queer', 'camp', 'female vocalists', 'catchy', 'electronic'],
    lyricSketch:
      'a heartbeat used as a hook, an invitation delivered in two syllables across a crowded room',
    bpm: 122,
    mood: 'sensual',
    vibes: ['Camp', 'Dancefloor', 'Glossy', 'Hypnotic'],
    themes: ['Desire', 'Nightlife'],
    energy: 0.84,
    intensity: 0.58,
    brightness: 0.68,
    danceability: 0.92,
    acousticness: 0.05,
  },
  {
    song: {
      id: 'sng_hounds',
      title: 'Hounds of Love',
      artist: 'Kate Bush',
      album: 'Hounds of Love',
      year: 1985,
      source: 'mock',
    },
    genres: ['art pop', 'baroque pop'],
    tags: ['80s', 'theatrical', 'female vocalists', 'witchy', 'dramatic', 'strange'],
    lyricSketch:
      'being chased by love as if it were weather, running through trees and deciding to stop running',
    mood: 'anxious',
    vibes: ['Dramatic', 'Witchy', 'Cinematic', 'Weird'],
    themes: ['Desire', 'Freedom', 'Obsession'],
    energy: 0.7,
    intensity: 0.76,
    brightness: 0.6,
    danceability: 0.5,
    acousticness: 0.34,
  },
  {
    song: {
      id: 'sng_chaise',
      title: 'Chaise Longue',
      artist: 'Wet Leg',
      album: 'Wet Leg',
      year: 2021,
      source: 'mock',
    },
    genres: ['post-punk', 'indie rock', 'art punk'],
    tags: ['deadpan', 'funny', 'weird', 'female vocalists', 'quirky', 'minimal'],
    lyricSketch:
      'a completely flat delivery of an absurd domestic scene, repeated until it becomes a joke you are in on',
    bpm: 120,
    mood: 'playful',
    vibes: ['Weird', 'Camp', 'Easy'],
    themes: ['Confidence', 'Friendship'],
    energy: 0.66,
    intensity: 0.44,
    brightness: 0.62,
    danceability: 0.6,
    acousticness: 0.22,
  },
  {
    song: {
      id: 'sng_vondutch',
      title: 'Von dutch',
      artist: 'Charli xcx',
      album: 'BRAT',
      year: 2024,
      source: 'mock',
    },
    genres: ['hyperpop', 'electroclash', 'dance'],
    tags: ['bratty', 'club', 'electronic', 'confident', 'experimental', 'loud'],
    lyricSketch:
      'a taunt aimed at someone pretending not to watch, all attitude and compressed low end',
    bpm: 134,
    mood: 'defiant',
    vibes: ['Weird', 'Dancefloor', 'Glossy', 'Camp'],
    themes: ['Confidence', 'Jealousy', 'Nightlife'],
    energy: 0.92,
    intensity: 0.84,
    brightness: 0.66,
    danceability: 0.88,
    acousticness: 0.03,
  },
  {
    song: {
      id: 'sng_dogdays',
      title: 'Dog Days Are Over',
      artist: 'Florence + The Machine',
      album: 'Lungs',
      year: 2009,
      source: 'mock',
    },
    genres: ['art pop', 'indie pop', 'baroque pop'],
    tags: ['euphoric', 'female vocalists', 'anthem', 'harp', 'cathartic', 'uplifting'],
    lyricSketch:
      'happiness arriving so suddenly it feels like a threat, a warning to run and meet it',
    bpm: 150,
    mood: 'euphoric',
    vibes: ['Anthemic', 'Dramatic', 'Organic', 'Singalong'],
    themes: ['Freedom', 'Celebration', 'Growing up'],
    energy: 0.88,
    intensity: 0.8,
    brightness: 0.74,
    danceability: 0.6,
    acousticness: 0.3,
  },
  {
    song: {
      id: 'sng_redbone',
      title: 'Redbone',
      artist: 'Childish Gambino',
      album: 'Awaken, My Love!',
      year: 2016,
      source: 'mock',
    },
    genres: ['psychedelic soul', 'funk', 'r&b'],
    tags: ['groovy', 'warm', 'smooth', 'analogue', 'nocturnal', 'bass'],
    lyricSketch:
      'a warning delivered in falsetto over a slow bassline, suspicion arriving before the evidence does',
    bpm: 80,
    mood: 'sensual',
    vibes: ['Groovy', 'Warm', 'Nocturnal', 'Retro'],
    themes: ['Jealousy', 'Desire'],
    energy: 0.48,
    intensity: 0.5,
    brightness: 0.44,
    danceability: 0.66,
    acousticness: 0.4,
  },
  {
    song: {
      id: 'sng_electricfeel',
      title: 'Electric Feel',
      artist: 'MGMT',
      album: 'Oracular Spectacular',
      year: 2007,
      source: 'mock',
    },
    genres: ['psychedelic pop', 'indie pop', 'neo-psychedelia'],
    tags: ['groovy', 'summer', 'good mood', 'indie', '00s', 'easy'],
    lyricSketch:
      'an electric attraction described like weather, humid and pleasant and slightly unreal',
    bpm: 103,
    mood: 'playful',
    vibes: ['Groovy', 'Easy', 'Retro', 'Organic'],
    themes: ['Desire', 'Escapism', 'Celebration'],
    energy: 0.6,
    intensity: 0.44,
    brightness: 0.64,
    danceability: 0.76,
    acousticness: 0.28,
  },
];

export const CATALOGUE_BY_ID = new Map(CATALOGUE.map((e) => [e.song.id, e]));

export const MOCK_SONGS: Song[] = CATALOGUE.map((entry) => entry.song);
