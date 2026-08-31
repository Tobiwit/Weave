import { CATALOGUE_BY_ID } from '../../data/mockCatalogue';
import type { Song } from '../../types';

/**
 * Measured audio characteristics.
 *
 * Only ever populated when a provider genuinely has the numbers. Live sources
 * are not wired up, so outside the development catalogue this returns nothing
 * and the profile falls back to clearly-labelled inferred values.
 */
export interface AudioFeatures {
  bpm?: number;
  energy?: number;
  brightness?: number;
  danceability?: number;
  acousticness?: number;
}

export interface AudioFeatureProvider {
  readonly id: string;
  getFeatures(song: Song, signal?: AbortSignal): Promise<AudioFeatures | null>;
}

export const mockAudioFeatureProvider: AudioFeatureProvider = {
  id: 'mock',
  async getFeatures(song) {
    const entry = CATALOGUE_BY_ID.get(song.id);
    if (!entry) return null;
    return {
      bpm: entry.bpm,
      energy: entry.energy,
      brightness: entry.brightness,
      danceability: entry.danceability,
      acousticness: entry.acousticness,
    };
  },
};

export async function fetchAudioFeatures(
  song: Song,
  signal?: AbortSignal,
): Promise<{ features: AudioFeatures | null; providerId: string }> {
  const features = await mockAudioFeatureProvider.getFeatures(song, signal);
  return { features, providerId: mockAudioFeatureProvider.id };
}

/** Names of the numeric profile fields a feature set actually measured. */
export function measuredFieldsFrom(features: AudioFeatures | null): string[] {
  if (!features) return [];
  return (['bpm', 'energy', 'brightness', 'danceability', 'acousticness'] as const)
    .filter((key) => typeof features[key] === 'number');
}
