import { VECTOR_RECIPE_VERSION } from '../../config/embedding';
import {
  getAllSongProfiles,
  getSongProfiles,
  getSongs,
  savePlaylist,
} from '../../db/repositories';
import { embeddingService } from '../../services/embedding';
import type { Playlist, PlaylistMatch, Song, SongProfile } from '../../types';
import { MATCHING_CONFIG } from '../../config/matching';
import { DESCRIPTOR_AXES } from '../../data/descriptorAxes';
import { DESCRIPTORS } from '../../data/descriptors';
import { getDescriptorVectors } from '../analysis/interpretSignals';
import type { AxisId } from '../song/axes';
import { readAxes, type AxisReadings } from '../song/axisReading';
import { placeKeyword, splitKeywords, type KeywordFacet } from '../matching/keywordFacets';
import {
  activeProfileTerms,
  buildAxisProfile,
  categoryWeightsFor,
  cosineSimilarity,
  librarySpread,
  tagCategoryWeigher,
  type LibrarySpread,
  buildLibraryCorpus,
  calculatePlaylistVector,
  centroid,
  moodEmbeddingText,
  playlistEmbeddingText,
  playlistMoodText,
  playlistStyleText,
  playlistTagVector,
  playlistTerms,
  playlistThemeText,
  rankPlaylists,
  songTagVector,
  styleEmbeddingText,
  themeEmbeddingText,
  profileFacets,
  weightedBlend,
  type PlaylistCandidate,
  type PlaylistFacets,
  type SongFacets,
  type TagCorpus,
  type TermVectorResolver,
} from '../matching';

/**
 * Recomputes and persists a playlist vector.
 *
 * Called whenever a playlist changes: its stated world is embedded, the
 * centroid of its songs is recalculated, and the two are blended by the
 * weights in the matching config.
 */
export async function updatePlaylistVectors(playlist: Playlist): Promise<Playlist> {
  const keywordEmbedding = await embeddingService.embed(
    playlistEmbeddingText(playlist),
  );

  const profiles = await getSongProfiles(playlist.songIds);
  const songEmbeddings = profiles
    .map((profile) => profile.semanticEmbedding)
    .filter((vector): vector is number[] => Array.isArray(vector) && vector.length > 0);

  const { centroidEmbedding } = calculatePlaylistVector({
    keywordEmbedding,
    songEmbeddings,
  });

  const next: Playlist = {
    ...playlist,
    keywordEmbedding,
    centroidEmbedding: centroidEmbedding.length ? centroidEmbedding : undefined,
    vectorVersion: VECTOR_RECIPE_VERSION,
    updatedAt: Date.now(),
  };
  await savePlaylist(next);
  return next;
}

/** The blended vector a playlist is matched against. */
export function playlistVectorOf(playlist: Playlist): number[] {
  return calculatePlaylistVector({
    keywordEmbedding: playlist.keywordEmbedding,
    songEmbeddings: playlist.centroidEmbedding ? [playlist.centroidEmbedding] : [],
  }).vector;
}

export function toCandidate(playlist: Playlist): PlaylistCandidate {
  return {
    playlistId: playlist.id,
    vector: playlistVectorOf(playlist),
    terms: playlistTerms(playlist),
  };
}

/**
 * Embeds every descriptor involved in a comparison so explanations can be
 * semantic rather than string matching. One batched call, then cached.
 */
export async function buildTermResolver(
  terms: string[],
): Promise<TermVectorResolver> {
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return () => undefined;

  try {
    const vectors = await embeddingService.embedMany(unique);
    const map = new Map<string, number[]>();
    unique.forEach((term, index) => map.set(term.toLowerCase(), vectors[index]));
    return (term: string) => map.get(term.trim().toLowerCase());
  } catch {
    // Explanations fall back to lexical overlap, which is still useful.
    return () => undefined;
  }
}

/* -------------------------------- facets --------------------------------- */

interface ReadSong {
  profile: SongProfile;
  song?: Song;
}

/**
 * Embeds a batch of texts, giving an empty vector back for the blank ones.
 *
 * A song with no themes should contribute nothing to the theme comparison.
 * Embedding an empty string instead would place it at some arbitrary point and
 * let it match other songs that also have no themes.
 */
async function embedTexts(texts: string[]): Promise<number[][]> {
  const wanted: number[] = [];
  texts.forEach((text, index) => {
    if (text.trim()) wanted.push(index);
  });

  const out = texts.map(() => [] as number[]);
  if (wanted.length === 0) return out;

  const vectors = await embeddingService.embedMany(
    wanted.map((index) => texts[index]),
  );
  wanted.forEach((index, position) => {
    out[index] = vectors[position] ?? [];
  });
  return out;
}

/**
 * Facet vectors for a set of songs, in one batched embedding call.
 *
 * The whole-reading vector is already stored on the profile; only the three
 * facet texts have to be built, and the embedding cache means they are built
 * once per song for the life of the library.
 */
async function facetsFor(
  entries: ReadSong[],
  corpus: TagCorpus,
): Promise<SongFacets[]> {
  const texts: string[] = [];
  for (const { profile, song } of entries) {
    texts.push(
      styleEmbeddingText(profile, song),
      moodEmbeddingText(profile),
      themeEmbeddingText(profile),
    );
  }

  const vectors = await embedTexts(texts);

  return entries.map(({ profile }, index) => ({
    axes: readAxes(profile),
    whole: profile.semanticEmbedding ?? [],
    style: vectors[index * 3] ?? [],
    moodVibe: vectors[index * 3 + 1] ?? [],
    themes: vectors[index * 3 + 2] ?? [],
    tags: songTagVector(profileFacets(profile).communityTags, corpus),
  }));
}

type FacetKey = 'style' | 'moodVibe' | 'themes';

/** A playlist's stated world, embedded once per facet. */
export interface PlaylistKeywordFacets {
  style: number[];
  moodVibe: number[];
  themes: number[];
}

/**
 * One facet of a playlist: what it says about itself, blended with what its
 * songs actually are.
 *
 * The same 35/65 split the whole playlist vector uses, applied per facet
 * rather than only once at the top. Keeping the written world out of the
 * facets was measurably wrong: with leave-one-out, a two-song playlist has a
 * single song left to build its facets from, and a song whose stated world
 * matched the playlist exactly scored 37 because one unrelated neighbour
 * defined every facet. The words a person wrote are evidence, and they are the
 * only evidence a young playlist has.
 */
function facetVector(
  facets: SongFacets[],
  key: FacetKey,
  keywords: PlaylistKeywordFacets | undefined,
  weights = MATCHING_CONFIG,
): number[] {
  const songs = centroid(
    facets.map((facet) => facet[key]).filter((v) => v.length > 0),
  );
  const stated = keywords?.[key] ?? [];

  if (!stated.length) return songs;
  if (!songs.length) return [...stated];

  return weightedBlend([
    { vector: stated, weight: weights.keywordWeight },
    { vector: songs, weight: weights.centroidWeight },
  ]);
}

/**
 * Builds what one playlist offers a song to be compared against.
 *
 * When the song is already in the playlist it is removed from every component
 * first, not just from the centroid. Otherwise the song would be measured
 * partly against itself: its own tags would inflate the tag overlap, its own
 * vector would be one of its nearest neighbours, and every playlist it already
 * belongs to would sit at the top of its own results.
 */
function playlistFacetsFor(
  playlist: Playlist,
  members: ReadSong[],
  memberFacets: SongFacets[],
  corpus: TagCorpus,
  keywords: PlaylistKeywordFacets | undefined,
  stated: StatedAxes | undefined,
  spread: LibrarySpread,
  excludeSongId?: string,
): PlaylistFacets {
  const keep = members
    .map((member, index) => ({ member, facet: memberFacets[index] }))
    .filter(({ member }) => member.profile.songId !== excludeSongId);

  const facets = keep.map((entry) => entry.facet);
  const songVectors = facets.map((facet) => facet.whole).filter((v) => v.length > 0);

  const { vector } = calculatePlaylistVector({
    keywordEmbedding: playlist.keywordEmbedding,
    songEmbeddings: songVectors,
  });

  const axisProfile = buildAxisProfile(
    facets.map((facet) => facet.axes),
    stated?.axes,
    spread,
  );

  return {
    whole: vector,
    songVectors,
    style: facetVector(facets, 'style', keywords),
    moodVibe: facetVector(facets, 'moodVibe', keywords),
    themes: facetVector(facets, 'themes', keywords),
    tags: playlistTagVector(
      keep.map((entry) => entry.member.profile),
      corpus,
    ),
    axes: Object.keys(axisProfile.bands).length ? axisProfile : null,
    tagWeigher: tagCategoryWeigher(categoryWeightsFor(playlist.keywords)),
    factors: playlist.weighting?.factors,
  };
}

export interface MatchOutcome {
  matches: PlaylistMatch[];
  /** True when no playlist had a usable vector, so nothing could be ranked. */
  empty: boolean;
}

/**
 * Everything a batch of comparisons needs, loaded once.
 *
 * Built here rather than per playlist so the whole library is read in a
 * handful of queries and every tag weight is measured against the same corpus.
 */
/**
 * Where a playlist's own words point on the eight scales.
 *
 * Each keyword is matched to the nearest descriptor, by label first and by
 * meaning otherwise, and borrows that descriptor's position. Keywords that sit
 * near nothing ("aux on") point nowhere and are left out rather than guessed.
 */
export interface StatedAxes {
  axes: Partial<Record<AxisId, number>>;
  matches: {
    keyword: string;
    descriptor: string | null;
    similarity: number;
    /** Which facet of the playlist this keyword describes. */
    facet: KeywordFacet;
    assigned: boolean;
  }[];
}

async function statedAxesFor(playlists: Playlist[]): Promise<Map<string, StatedAxes>> {
  const keywords = [
    ...new Set(playlists.flatMap((p) => p.keywords.map((k) => k.trim())).filter(Boolean)),
  ];
  const nearest = new Map<string, { id: string | null; similarity: number }>();

  if (keywords.length > 0) {
    const byLabel = new Map(DESCRIPTORS.map((d) => [d.label.toLowerCase(), d.id]));
    const unlabelled = keywords.filter((k) => !byLabel.has(k.toLowerCase()));
    for (const keyword of keywords) {
      const id = byLabel.get(keyword.toLowerCase());
      if (id) nearest.set(keyword, { id, similarity: 1 });
    }
    if (unlabelled.length > 0) {
      try {
        const [vectors, descriptorVectors] = await Promise.all([
          embeddingService.embedMany(unlabelled),
          getDescriptorVectors(),
        ]);
        unlabelled.forEach((keyword, index) => {
          let best: string | null = null;
          let bestScore = -1;
          descriptorVectors.forEach((vector, d) => {
            if (!DESCRIPTOR_AXES[DESCRIPTORS[d].id]) return;
            const score = cosineSimilarity(vectors[index], vector);
            if (score > bestScore) {
              bestScore = score;
              best = DESCRIPTORS[d].id;
            }
          });
          nearest.set(keyword, {
            id: bestScore >= MATCHING_CONFIG.axes.keywordMinSimilarity ? best : null,
            similarity: bestScore,
          });
        });
      } catch {
        // Without embeddings only exact labels can point anywhere.
      }
    }
  }

  const out = new Map<string, StatedAxes>();
  for (const playlist of playlists) {
    const sums: Partial<Record<AxisId, { sum: number; n: number }>> = {};
    const matches: StatedAxes['matches'] = [];
    for (const keyword of playlist.keywords) {
      const hit = nearest.get(keyword.trim());
      const label = hit?.id ? DESCRIPTORS.find((d) => d.id === hit.id)?.label ?? hit.id : null;
      matches.push({
        keyword,
        descriptor: label,
        similarity: hit?.similarity ?? 0,
        ...placeKeyword(keyword, hit?.id ?? null),
      });
      if (!hit?.id) continue;
      for (const [axis, value] of Object.entries(DESCRIPTOR_AXES[hit.id] ?? {}) as [
        AxisId,
        number,
      ][]) {
        const entry = (sums[axis] ??= { sum: 0, n: 0 });
        entry.sum += value;
        entry.n += 1;
      }
    }
    const axes: Partial<Record<AxisId, number>> = {};
    for (const [axis, { sum, n }] of Object.entries(sums) as [AxisId, { sum: number; n: number }][]) {
      axes[axis] = sum / n;
    }
    out.set(playlist.id, { axes, matches });
  }
  return out;
}

export interface MatchingContext {
  corpus: TagCorpus;
  /** Every axis's spread across the library, the yardstick for tightness. */
  spread: LibrarySpread;
  axesBySongId: Map<string, AxisReadings>;
  statedAxesByPlaylistId: Map<string, StatedAxes>;
  profilesById: Map<string, SongProfile>;
  songsById: Map<string, Song>;
  facetsBySongId: Map<string, SongFacets>;
  keywordFacetsByPlaylistId: Map<string, PlaylistKeywordFacets>;
}

export async function buildMatchingContext(
  playlists: Playlist[],
  extraSongIds: string[] = [],
): Promise<MatchingContext> {
  const allProfiles = await getAllSongProfiles();
  // Across playlists, not just across songs: matching is choosing between
  // playlists, so a word on every one of them cannot help decide.
  const corpus = buildLibraryCorpus(allProfiles, playlists);
  const profilesById = new Map(allProfiles.map((p) => [p.songId, p]));

  const needed = new Set<string>(extraSongIds);
  for (const playlist of playlists) {
    for (const songId of playlist.songIds) needed.add(songId);
  }

  const songs = await getSongs([...needed]);
  const songsById = new Map(songs.map((song) => [song.id, song]));

  const entries: ReadSong[] = [...needed].flatMap((songId) => {
    const profile = profilesById.get(songId);
    return profile ? [{ profile, song: songsById.get(songId) }] : [];
  });

  const facets = await facetsFor(entries, corpus);
  const facetsBySongId = new Map(
    entries.map((entry, index) => [entry.profile.songId, facets[index]]),
  );

  const axesBySongId = new Map(
    allProfiles.map((profile) => [
      profile.songId,
      facetsBySongId.get(profile.songId)?.axes ?? readAxes(profile),
    ]),
  );
  const spread = librarySpread([...axesBySongId.values()]);
  const statedAxesByPlaylistId = await statedAxesFor(playlists);

  // Each facet is phrased from only the keywords that describe it.
  const keywordTexts = playlists.flatMap((playlist) => {
    const split = splitKeywords(statedAxesByPlaylistId.get(playlist.id)?.matches ?? []);
    return [
      playlistStyleText(split.style),
      playlistMoodText(split.moodVibe),
      playlistThemeText(split.themes),
    ];
  });
  const keywordVectors = await embedTexts(keywordTexts);
  const keywordFacetsByPlaylistId = new Map(
    playlists.map((playlist, index) => [
      playlist.id,
      {
        style: keywordVectors[index * 3] ?? [],
        moodVibe: keywordVectors[index * 3 + 1] ?? [],
        themes: keywordVectors[index * 3 + 2] ?? [],
      },
    ]),
  );

  return {
    corpus,
    spread,
    axesBySongId,
    statedAxesByPlaylistId,
    profilesById,
    songsById,
    facetsBySongId,
    keywordFacetsByPlaylistId,
  };
}

function membersOf(playlist: Playlist, context: MatchingContext): ReadSong[] {
  return playlist.songIds.flatMap((songId) => {
    const profile = context.profilesById.get(songId);
    return profile ? [{ profile, song: context.songsById.get(songId) }] : [];
  });
}

/** A candidate scoped to one song, with that song removed from the playlist. */
export function candidateForSong(
  playlist: Playlist,
  songId: string,
  context: MatchingContext,
): PlaylistCandidate {
  const members = membersOf(playlist, context);
  const memberFacets = members.map(
    (member) =>
      context.facetsBySongId.get(member.profile.songId) ?? {
        axes: readAxes(member.profile),
        whole: [],
        style: [],
        moodVibe: [],
        themes: [],
        tags: new Map(),
      },
  );

  const facets = playlistFacetsFor(
    playlist,
    members,
    memberFacets,
    context.corpus,
    context.keywordFacetsByPlaylistId.get(playlist.id),
    context.statedAxesByPlaylistId.get(playlist.id),
    context.spread,
    songId,
  );

  return {
    playlistId: playlist.id,
    vector: facets.whole,
    facets,
    terms: playlistTerms(playlist),
  };
}

export async function matchSongToPlaylists(
  profile: SongProfile,
  playlists: Playlist[],
): Promise<MatchOutcome> {
  const context = await buildMatchingContext(playlists, [profile.songId]);

  // The song being matched may have unsaved edits, so its facets are built
  // from the profile passed in rather than from the copy on disk.
  const [songFacets] = await facetsFor(
    [{ profile, song: context.songsById.get(profile.songId) }],
    context.corpus,
  );

  const candidates = playlists
    .map((playlist) => candidateForSong(playlist, profile.songId, context))
    .filter(
      (candidate) =>
        candidate.vector.length > 0 ||
        (candidate.facets?.songVectors.length ?? 0) > 0,
    );

  if (!songFacets.whole.length || candidates.length === 0) {
    return { matches: [], empty: true };
  }

  const songTerms = activeProfileTerms(profile);
  const resolver = await buildTermResolver([
    ...songTerms,
    ...candidates.flatMap((c) => c.terms),
  ]);

  return {
    matches: rankPlaylists(songFacets, songTerms, candidates, resolver),
    empty: false,
  };
}
