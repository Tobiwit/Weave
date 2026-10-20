import { MATCHING_CONFIG } from '../../config/matching';
import { DESCRIPTORS } from '../../data/descriptors';
import { normalizeTag } from './tagRarity';

/**
 * What a community tag is about.
 *
 * Last.fm tags mix kinds of fact freely: "dream pop" is the music, "cuban" is
 * where an artist is from, "2010s" is when, "female vocalists" is who sings.
 * Rarity alone cannot tell these apart, and a rare fact about an artist's
 * passport is still not a fact about how a song feels. So every tag is sorted
 * into a category first and the category sets a ceiling on what it can count
 * for.
 *
 * Lexical rules, not a model: they are cheap, deterministic and readable, and
 * a tag that matches nothing lands in `other` at a middling weight rather than
 * being thrown away.
 */

export type TagCategory =
  | 'genre'
  | 'character'
  | 'instrument'
  | 'vocals'
  | 'era'
  | 'place'
  | 'other';

export const TAG_CATEGORIES: TagCategory[] = [
  'genre',
  'character',
  'instrument',
  'vocals',
  'era',
  'place',
  'other',
];

/** Words that make a tag a genre wherever they appear in it. */
const GENRE_WORDS = [
  'pop', 'rock', 'indie', 'hip hop', 'hip-hop', 'hiphop', 'rap', 'trap', 'house',
  'techno', 'trance', 'edm', 'electro', 'electronica', 'dubstep', 'drum and bass',
  'dnb', 'garage', 'grime', 'disco', 'funk', 'soul', 'r&b', 'rnb', 'blues', 'jazz',
  'folk', 'country', 'metal', 'punk', 'emo', 'grunge', 'shoegaze', 'ambient',
  'synth', 'wave', 'reggae', 'reggaeton', 'dancehall', 'ska', 'gospel', 'classical',
  'opera', 'soundtrack', 'score', 'lo-fi', 'lofi', 'chillwave', 'idm', 'breakbeat',
  'downtempo', 'trip hop', 'trip-hop', 'hardcore', 'post-', 'alternative', 'dance',
  'club', 'singer-songwriter', 'acoustic', 'bossa', 'samba', 'salsa', 'cumbia',
  'bachata', 'merengue', 'flamenco', 'afrobeat', 'afrobeats', 'amapiano', 'k-pop',
  'kpop', 'j-pop', 'jpop', 'city pop', 'bedroom', 'hyperpop', 'experimental',
  'psychedelic', 'progressive', 'krautrock', 'new wave', 'britpop', 'baroque',
  'chamber', 'art pop', 'noise', 'drill', 'phonk', 'latin', 'mpb', 'tropical',
];

const INSTRUMENT_WORDS = [
  'guitar', 'piano', 'synth', 'synthesizer', 'saxophone', 'sax', 'violin', 'cello',
  'strings', 'bass', 'drums', 'drum machine', '808', 'horns', 'brass', 'trumpet',
  'organ', 'harp', 'banjo', 'ukulele', 'flute', 'orchestra', 'orchestral',
  'instrumental',
];

const VOCAL_WORDS = [
  'vocal', 'vocals', 'vocalist', 'vocalists', 'singer', 'female voice', 'male voice',
  'falsetto', 'choir', 'a cappella', 'acapella', 'duet', 'rapper',
];

/**
 * Nationalities, regions and places a tag can name. Kept to the ones that turn
 * up as tags; anything missing simply falls through to `other`.
 */
const PLACE_WORDS = [
  'american', 'usa', 'us', 'british', 'uk', 'english', 'scottish', 'irish', 'welsh',
  'canadian', 'australian', 'new zealand', 'french', 'german', 'deutsch', 'italian',
  'spanish', 'espanol', 'español', 'portuguese', 'brazilian', 'brasil', 'mexican',
  'cuban', 'puerto rican', 'colombian', 'argentinian', 'argentine', 'chilean',
  'peruvian', 'venezuelan', 'dominican', 'jamaican', 'nigerian', 'ghanaian',
  'south african', 'african', 'swedish', 'norwegian', 'danish', 'finnish',
  'icelandic', 'dutch', 'belgian', 'swiss', 'austrian', 'polish', 'russian',
  'ukrainian', 'greek', 'turkish', 'israeli', 'arabic', 'indian', 'japanese',
  'korean', 'chinese', 'taiwanese', 'filipino', 'indonesian', 'thai', 'vietnamese',
  'scandinavian', 'nordic', 'european', 'latino', 'latina', 'caribbean',
  'london', 'manchester', 'new york', 'nyc', 'los angeles', 'la', 'atlanta',
  'chicago', 'detroit', 'berlin', 'paris', 'toronto', 'montreal', 'seoul', 'tokyo',
  'havana', 'miami', 'bristol', 'glasgow', 'melbourne', 'sydney',
];

const ERA_PATTERN =
  /^(?:\d{2}s|\d{4}s?|'\d{2}s|\d{2,4}'s|oldies|classic|vintage|retro|y2k|millennial|decade|(?:early|late|mid)[ -]?\d{2,4}s?)$/;

const CHARACTER_LABELS = new Set(DESCRIPTORS.map((d) => d.label.toLowerCase()));
/** Mood and texture words listeners use that are not descriptor labels. */
const CHARACTER_WORDS = [
  'chill', 'chillout', 'mellow', 'sad', 'happy', 'upbeat', 'energetic', 'ethereal',
  'haunting', 'beautiful', 'emotional', 'sexy', 'moody', 'atmospheric', 'catchy',
  'groovy', 'dreamy', 'dark', 'melancholy', 'melancholic', 'relaxing', 'calm',
  'party', 'summer', 'night', 'late night', 'romantic', 'love', 'angry',
  'aggressive', 'heavy', 'soft', 'lush', 'warm', 'cold', 'gritty', 'raw', 'smooth',
  'fun', 'quirky', 'epic', 'uplifting', 'hypnotic', 'trippy', 'nostalgic', 'sensual',
  'bittersweet', 'introspective', 'feel good', 'feelgood', 'cinematic',
];

const words = (tag: string) => tag.split(/[\s/,&+-]+/).filter(Boolean);

function containsWord(tag: string, list: string[]): boolean {
  const tokens = new Set(words(tag));
  return list.some((entry) =>
    entry.includes(' ') || entry.endsWith('-') ? tag.includes(entry) : tokens.has(entry),
  );
}

/** Sorts a tag into the one category that best describes what it is about. */
export function categorizeTag(raw: string): TagCategory {
  const tag = normalizeTag(raw);
  if (!tag) return 'other';

  if (ERA_PATTERN.test(tag) || /^\d{2,4}s\b/.test(tag)) return 'era';
  if (containsWord(tag, VOCAL_WORDS)) return 'vocals';
  // Genres before places, so "latin pop" and "uk garage" are music first.
  if (containsWord(tag, GENRE_WORDS)) return 'genre';
  if (PLACE_WORDS.includes(tag) || words(tag).every((w) => PLACE_WORDS.includes(w))) {
    return 'place';
  }
  if (containsWord(tag, INSTRUMENT_WORDS)) return 'instrument';
  if (CHARACTER_LABELS.has(tag) || containsWord(tag, CHARACTER_WORDS)) return 'character';
  return 'other';
}

export type CategoryWeights = Record<TagCategory, number>;

/**
 * The category ceilings in force for one playlist.
 *
 * A category the playlist's own keywords use is restored to full weight: a
 * playlist called "cuban classics" is telling you that where the music comes
 * from is the point, and the default discount would be exactly wrong there.
 */
export function categoryWeightsFor(
  keywords: string[],
  base: CategoryWeights = MATCHING_CONFIG.tagCategories,
): CategoryWeights {
  const weights = { ...base };
  for (const keyword of keywords) {
    const category = categorizeTag(keyword);
    if (category !== 'other') weights[category] = 1;
  }
  return weights;
}

/** A lookup from tag to its category ceiling, memoised per call site. */
export function tagCategoryWeigher(
  weights: CategoryWeights,
): (tag: string) => number {
  const cache = new Map<string, number>();
  return (tag: string) => {
    let value = cache.get(tag);
    if (value === undefined) {
      value = weights[categorizeTag(tag)];
      cache.set(tag, value);
    }
    return value;
  };
}
