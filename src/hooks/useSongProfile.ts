import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { getSong, getSongProfile, saveSongProfile } from '../db/repositories';
import type { SongProfile } from '../types';

export function useSongProfile(songId: string | undefined) {
  const profile = useLiveQuery(
    () => (songId ? getSongProfile(songId) : undefined),
    [songId],
  );
  const song = useLiveQuery(() => (songId ? getSong(songId) : undefined), [songId]);

  const update = useCallback(
    async (patch: Partial<SongProfile>) => {
      if (!profile) return;
      await saveSongProfile({ ...profile, ...patch });
    },
    [profile],
  );

  return { profile, song, update, loading: profile === undefined || song === undefined };
}
