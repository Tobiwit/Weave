import type { Playlist, Song, SongProfile } from '../../types';

/**
 * Manual additions are stored as `facet:term` so the interface knows which line
 * of the reading a word belongs to. Everything downstream wants the bare word.
 * Untagged entries are passed through, so older profiles still read correctly.
 */
export function manualTagLabel(tag: string): string {
  const separator = tag.indexOf(':');
  return separator === -1 ? tag : tag.slice(separator + 1);
}

/** The facets the reading is edited through, as `Fingerprint` names them. */
const MANUAL_GROUPS = { genre: 'genre', vibe: 'vibe', theme: 'theme' } as const;

export interface ProfileFacets {
  mood?: string;
  genres: string[];
  vibes: string[];
  themes: string[];
  communityTags: string[];
}

/**
 * A profile's descriptors as they now stand: inferred, minus what was removed,
 * plus what was added, each word back in the facet it was added from.
 *
 * The single place edits are applied. Everything that builds text or vectors
 * from a profile goes through here, so a correction the user made in the
 * interface reaches matching instead of only the display.
 */
export function profileFacets(profile: SongProfile): ProfileFacets {
  const removed = new Set(profile.removedTags.map((term) => term.toLowerCase()));
  const kept = (terms: string[]) =>
    terms.filter((term) => !removed.has(term.toLowerCase()));

  const manual = (group: string) =>
    profile.manualTags
      .filter((tag) => tag.toLowerCase().startsWith(`${group}:`))
      .map(manualTagLabel);

  // Profiles written before manual tags carried a facet prefix. Character is
  // the general-purpose line, so that is where an unplaceable word goes.
  const unplaced = profile.manualTags.filter((tag) => !tag.includes(':'));

  return {
    mood: profile.mood,
    genres: dedupeTerms([...kept(profile.genres), ...manual(MANUAL_GROUPS.genre)]),
    vibes: dedupeTerms([
      ...kept(profile.vibes),
      ...manual(MANUAL_GROUPS.vibe),
      ...unplaced,
    ]),
    themes: dedupeTerms([...kept(profile.themes), ...manual(MANUAL_GROUPS.theme)]),
    communityTags: kept(profile.communityTags),
  };
}

/** Descriptors currently active on a profile, flattened for explanations. */
export function activeProfileTerms(profile: SongProfile): string[] {
  const facets = profileFacets(profile);
  return dedupeTerms([
    ...facets.vibes,
    ...facets.themes,
    ...facets.genres,
    ...(facets.mood ? [facets.mood] : []),
    ...facets.communityTags.slice(0, 8),
  ]);
}

/** The descriptors that define a playlist world, in priority order. */
export function playlistTerms(playlist: Playlist): string[] {
  return dedupeTerms([
    ...playlist.keywords,
    ...(playlist.description ? playlist.description.split(/[,·|]/) : []),
  ]);
}

export function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/**
 * The canonical text a song is embedded from.
 *
 * One recipe for every analysis path. Cosine similarity between two vectors
 * only means anything if both were built the same way, so the interactive
 * reveal, the background queue and the backfill all come through this
 * function. `PROFILE_EMBEDDING_VERSION` records which formulation a stored
 * vector used; change the shape here and bump it there.
 *
 * Repeating the strongest signals gives them more weight in the sentence
 * embedding.
 */
export function profileEmbeddingText(profile: SongProfile): string {
  const facets = profileFacets(profile);
  const parts: string[] = [];
  if (facets.mood) parts.push(`Mood: ${facets.mood}.`);
  if (facets.genres.length) parts.push(`Style: ${facets.genres.join(', ')}.`);
  if (facets.vibes.length) parts.push(`Character: ${facets.vibes.join(', ')}.`);
  if (facets.themes.length) parts.push(`Themes: ${facets.themes.join(', ')}.`);
  if (facets.communityTags.length) {
    parts.push(`Described as: ${facets.communityTags.slice(0, 12).join(', ')}.`);
  }
  return parts.join(' ');
}

/**
 * The text a playlist world is embedded from.
 *
 * Deliberately mirrors the shape of `profileEmbeddingText`. A sentence model
 * places text partly by its phrasing, so describing a playlist in a different
 * style from a song pushes the two into different regions and depresses every
 * cross-comparison. Measured over the development library, matching the phrasing
 * raised playlist-to-song-centroid similarity from about 0.48 to 0.60.
 *
 * The playlist name is left out on purpose: names like "aux on" carry no
 * meaning for the model and measurably dilute the signal.
 */
export function playlistEmbeddingText(playlist: Playlist): string {
  const keywords = playlist.keywords.join(', ');
  const parts: string[] = [];
  if (keywords) {
    parts.push(`Character: ${keywords}.`);
    parts.push(`Described as: ${keywords}.`);
  }
  if (playlist.description) parts.push(`${playlist.description}.`);
  return parts.join(' ');
}

/* -------------------------------------------------------------------------
 * Facet texts.
 *
 * Matching compares songs facet by facet rather than through one blended
 * vector, so that a single strong word cannot carry the whole score. Each of
 * these is embedded separately; every one is a short phrase in the same
 * "Label: terms." shape, which keeps their similarity distributions
 * comparable to each other.
 * ---------------------------------------------------------------------- */

/** The decade a release belongs to, as a phrase a sentence model understands. */
export function eraOf(year?: number): string | undefined {
  if (!year || !Number.isFinite(year) || year < 1900 || year > 2100) return undefined;
  return `${Math.floor(year / 10) * 10}s`;
}

/** Who made it and in what tradition: artist, genres, era. */
export function styleEmbeddingText(profile: SongProfile, song?: Song): string {
  const facets = profileFacets(profile);
  const parts: string[] = [];
  if (song?.artist) parts.push(`Artist: ${song.artist}.`);
  if (facets.genres.length) parts.push(`Style: ${facets.genres.join(', ')}.`);
  const era = eraOf(song?.year);
  if (era) parts.push(`Era: ${era}.`);
  return parts.join(' ');
}

/** How it feels: the mood word and the character descriptors. */
export function moodEmbeddingText(profile: SongProfile): string {
  const facets = profileFacets(profile);
  const parts: string[] = [];
  if (facets.mood) parts.push(`Mood: ${facets.mood}.`);
  if (facets.vibes.length) parts.push(`Character: ${facets.vibes.join(', ')}.`);
  return parts.join(' ');
}

/** What it is about. */
export function themeEmbeddingText(profile: SongProfile): string {
  const facets = profileFacets(profile);
  return facets.themes.length ? `Themes: ${facets.themes.join(', ')}.` : '';
}

/* -------------------------------------------------------------------------
 * A playlist's stated world, phrased one facet at a time.
 *
 * A playlist's keywords are one undivided list: "weird, camp, playful,
 * hyperpop" says something about style and something about feeling without
 * separating them. So each facet reads the whole list in its own phrasing
 * rather than trying to split it.
 *
 * The phrasing is the point. A sentence model places text partly by its shape,
 * so a playlist described as "Character: ..." and a song described as
 * "Artist: ... Style: ..." land in different regions no matter how well the
 * words agree. Every text below mirrors the song-side facet it is compared
 * with, which is the same reason `playlistEmbeddingText` mirrors
 * `profileEmbeddingText`.
 * ---------------------------------------------------------------------- */

export function playlistStyleText(playlist: Playlist): string {
  const keywords = playlist.keywords.join(', ');
  return keywords ? `Style: ${keywords}.` : '';
}

export function playlistMoodText(playlist: Playlist): string {
  const keywords = playlist.keywords.join(', ');
  return keywords ? `Character: ${keywords}.` : '';
}

export function playlistThemeText(playlist: Playlist): string {
  const keywords = playlist.keywords.join(', ');
  return keywords ? `Themes: ${keywords}.` : '';
}
