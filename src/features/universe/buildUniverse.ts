import { getSongProfiles } from '../../db/repositories';
import { projectVectors } from '../../services/projection';
import type { Playlist } from '../../types';
import { cosineSimilarity, normalizeSimilarity } from '../matching';
import { ensureLibraryVectors } from '../playlists/ensureVectors';
import { playlistVectorOf } from '../playlists/playlistEngine';

export interface UniversePoint {
  id: string;
  x: number;
  y: number;
}

export interface UniversePlaylistNode extends UniversePoint {
  playlist: Playlist;
  /** Visual spread of the region, derived from how far its songs sit. */
  radius: number;
}

export interface UniverseLink {
  from: string;
  to: string;
  score: number;
}

export interface UniverseData {
  nodes: UniversePlaylistNode[];
  songPoints: (UniversePoint & { playlistId: string })[];
  links: UniverseLink[];
}

const LINK_THRESHOLD = 40;

/**
 * Builds the Universe layout.
 *
 * Projection is display only. Every similarity here, including which regions
 * are linked, is computed in the original embedding space first.
 */
export async function buildUniverse(): Promise<UniverseData> {
  const playlists = await ensureLibraryVectors();
  const usable = playlists.filter((p) => playlistVectorOf(p).length > 0);
  if (usable.length === 0) return { nodes: [], songPoints: [], links: [] };

  const playlistVectors = usable.map(playlistVectorOf);

  // Song points are projected alongside playlists so they land near the
  // regions they belong to instead of in an unrelated space.
  const songOwners: string[] = [];
  const songVectors: number[][] = [];
  const songIds: string[] = [];

  for (const playlist of usable) {
    const profiles = await getSongProfiles(playlist.songIds);
    for (const profile of profiles) {
      if (!profile.semanticEmbedding?.length) continue;
      songOwners.push(playlist.id);
      songVectors.push(profile.semanticEmbedding);
      songIds.push(profile.songId);
    }
  }

  const projected = await projectVectors([...playlistVectors, ...songVectors]);

  const nodes: UniversePlaylistNode[] = usable.map((playlist, index) => {
    const [x, y] = projected[index] ?? [0, 0];
    return { id: playlist.id, playlist, x, y, radius: 0.24 };
  });

  const songPoints = songIds.map((songId, index) => {
    const [x, y] = projected[playlistVectors.length + index] ?? [0, 0];
    return { id: songId, playlistId: songOwners[index], x, y };
  });

  // Region radius follows how far its own songs landed, so a broad playlist
  // occupies more space than a tight one.
  for (const node of nodes) {
    const own = songPoints.filter((point) => point.playlistId === node.id);
    if (own.length === 0) continue;
    const mean =
      own.reduce((sum, p) => sum + Math.hypot(p.x - node.x, p.y - node.y), 0) /
      own.length;
    node.radius = Math.min(0.6, Math.max(0.16, mean * 1.5));
  }

  const links: UniverseLink[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const score = normalizeSimilarity(
        cosineSimilarity(playlistVectors[i], playlistVectors[j]),
      );
      if (score >= LINK_THRESHOLD) {
        links.push({ from: usable[i].id, to: usable[j].id, score });
      }
    }
  }

  return { nodes, songPoints, links };
}
