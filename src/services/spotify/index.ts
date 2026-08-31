import type { Song } from '../../types';

/**
 * Spotify integration boundary.
 *
 * Spotify is deliberately NOT part of the analytical pipeline: no Spotify
 * content is sent into embedding or interpretation, and nothing in the app is
 * gated behind Spotify authentication. It exists only as an adapter into the
 * user library, and is disabled for the MVP.
 */

export interface ExternalPlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  imageUrl?: string;
}

export interface LibraryImportProvider {
  readonly id: string;
  readonly enabled: boolean;
  isAuthenticated(): boolean;
  authenticate(): Promise<void>;
  listPlaylists(): Promise<ExternalPlaylistSummary[]>;
  importPlaylistTracks(playlistId: string): Promise<Song[]>;
}

export class IntegrationDisabledError extends Error {
  constructor(name: string) {
    super(`${name} import is not available yet`);
    this.name = 'IntegrationDisabledError';
  }
}

export const spotifyImportProvider: LibraryImportProvider = {
  id: 'spotify',
  enabled: false,
  isAuthenticated: () => false,
  async authenticate() {
    throw new IntegrationDisabledError('Spotify');
  },
  async listPlaylists() {
    throw new IntegrationDisabledError('Spotify');
  },
  async importPlaylistTracks() {
    throw new IntegrationDisabledError('Spotify');
  },
};

export const LIBRARY_IMPORT_PROVIDERS: LibraryImportProvider[] = [
  spotifyImportProvider,
];
