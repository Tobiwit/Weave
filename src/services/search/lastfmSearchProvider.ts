import type { Song } from '../../types';
import { lastfmRequest, pickImage } from '../lastfm/client';
import type { SongSearchProvider } from './types';

interface LastfmTrackSearchResponse {
  results?: {
    trackmatches?: {
      track?: {
        name: string;
        artist: string;
        mbid?: string;
        image?: { size: string; ['#text']: string }[];
      }[];
    };
  };
}

export const lastfmSearchProvider: SongSearchProvider = {
  id: 'lastfm',
  async search(query, signal) {
    const data = await lastfmRequest<LastfmTrackSearchResponse>(
      'track.search',
      { track: query, limit: '10' },
      signal,
    );

    const tracks = data.results?.trackmatches?.track ?? [];
    return tracks.map((track): Song => {
      const mbid = track.mbid && track.mbid.length > 0 ? track.mbid : undefined;
      return {
        id: mbid
          ? `mb_${mbid}`
          : `lfm_${encodeURIComponent(`${track.artist}::${track.name}`)}`,
        title: track.name,
        artist: track.artist,
        artworkUrl: pickImage(track.image),
        mbid,
        source: 'lastfm',
      };
    });
  },
};
