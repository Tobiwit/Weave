import type { Playlist, SongProfile } from '../../types';

/**
 * Manual additions are stored as `facet:term` so the interface knows which line
 * of the reading a word belongs to. Everything downstream wants the bare word.
 * Untagged entries are passed through, so older profiles still read correctly.
 */
export function manualTagLabel(tag: string): string {
  const separator = tag.indexOf(':');
  return separator === -1 ? tag : tag.slice(separator + 1);
}

/** Descriptors currently active on a profile: inferred, minus removed, plus manual. */
export function activeProfileTerms(profile: SongProfile): string[] {
  const removed = new Set(profile.removedTags.map((t) => t.toLowerCase()));
  const inferred = [
    ...profile.vibes,
    ...profile.themes,
    ...profile.genres,
    ...(profile.mood ? [profile.mood] : []),
    ...profile.communityTags.slice(0, 8),
  ];
  const kept = inferred.filter((t) => !removed.has(t.toLowerCase()));
  return dedupeTerms([...kept, ...profile.manualTags.map(manualTagLabel)]);
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
 * The single text blob a profile is embedded from. Repeating the strongest
 * signals gives them more weight in the sentence embedding.
 */
export function profileEmbeddingText(profile: SongProfile): string {
  const parts: string[] = [];
  if (profile.mood) parts.push(`Mood: ${profile.mood}.`);
  if (profile.genres.length) parts.push(`Style: ${profile.genres.join(', ')}.`);
  if (profile.vibes.length) parts.push(`Character: ${profile.vibes.join(', ')}.`);
  if (profile.themes.length) parts.push(`Themes: ${profile.themes.join(', ')}.`);
  if (profile.communityTags.length) {
    parts.push(`Described as: ${profile.communityTags.slice(0, 12).join(', ')}.`);
  }
  if (profile.manualTags.length) {
    parts.push(`Also: ${profile.manualTags.map(manualTagLabel).join(', ')}.`);
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
