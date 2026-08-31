import { CATALOGUE } from '../../data/mockCatalogue';
import type { Song } from '../../types';
import type { SongSearchProvider } from './types';

function score(entry: { title: string; artist: string; album?: string }, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = entry.title.toLowerCase();
  const artist = entry.artist.toLowerCase();
  const album = (entry.album ?? '').toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (artist.startsWith(q)) return 70;
  if (title.includes(q)) return 60;
  if (artist.includes(q)) return 50;
  if (album.includes(q)) return 30;

  // Loose token match so partial words still find something.
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = `${title} ${artist} ${album}`;
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits > 0 ? 10 * hits : 0;
}

export const mockSearchProvider: SongSearchProvider = {
  id: 'mock',
  async search(query) {
    const results = CATALOGUE.map((entry) => ({
      song: entry.song,
      score: score(entry.song, query),
    }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.song);

    // A small delay keeps the search field feeling like a real network call
    // without inventing a loading state that is not there.
    await new Promise((resolve) => setTimeout(resolve, 120));
    return results as Song[];
  },
};
