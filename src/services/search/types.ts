import type { Song } from '../../types';

export interface SongSearchProvider {
  readonly id: string;
  search(query: string, signal?: AbortSignal): Promise<Song[]>;
}
