import { getAllSongProfiles, getSongs, saveSongProfile } from '../../db/repositories';
import {
  fetchAudioEvidence,
  flatFeaturesFrom,
  measuredFieldsFrom,
  type AudioResult,
} from '../../services/audio';
import type { SongProfile, TraceEntry } from '../../types';

/** A song asked within this long is not asked again by a backfill. */
const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

export interface AudioBackfillReport {
  checked: number;
  /** Songs at least one source returned measurements for. */
  measured: number;
  bySource: Record<string, number>;
}

function needsAudio(profile: SongProfile, now: number): boolean {
  if (!profile.audio) return true;
  return now - profile.audio.checkedAt > RECHECK_AFTER_MS;
}

/**
 * Asks the audio sources about every read song that has not been asked yet.
 *
 * Songs read before measured audio existed would otherwise sit on inferred
 * positions until someone happened to re-read them. Only the audio is
 * refreshed: the descriptors stay as they were, and the axes pick the new
 * measurements up on their own because they are recomputed on demand.
 *
 * Answers are cached by the providers, so running this twice costs nothing.
 */
export async function backfillAudio(
  onProgress?: (done: number, total: number) => void,
): Promise<AudioBackfillReport> {
  const now = Date.now();
  const profiles = (await getAllSongProfiles()).filter((p) => needsAudio(p, now));
  const songs = new Map((await getSongs(profiles.map((p) => p.songId))).map((s) => [s.id, s]));

  const report: AudioBackfillReport = { checked: 0, measured: 0, bySource: {} };
  let next = 0;

  const worker = async () => {
    while (next < profiles.length) {
      const profile = profiles[next++];
      const song = songs.get(profile.songId);
      if (song) {
        const { audio, traces } = await fetchAudioEvidence(song).catch(
          (): AudioResult => ({ audio: { checkedAt: Date.now() }, traces: [] }),
        );
        // Nothing was actually asked (mock mode, or no ids to ask by): leave
        // the song unstamped so a later backfill with live sources tries it.
        if (traces.length > 0 && traces.every((t) => t.status === 'skipped')) {
          report.checked += 1;
          onProgress?.(report.checked, profiles.length);
          continue;
        }
        const flat = flatFeaturesFrom(audio);
        const stamped: TraceEntry[] = traces.map((t) => ({ ...t, stage: 'backfill', at: Date.now() }));
        const sources = (['reccobeats', 'acousticbrainz', 'mock'] as const).filter((k) => audio[k]);
        for (const source of sources) {
          report.bySource[source] = (report.bySource[source] ?? 0) + 1;
        }
        if (sources.length) report.measured += 1;

        await saveSongProfile({
          ...profile,
          audio,
          measuredFields: measuredFieldsFrom(audio),
          energy: flat.energy ?? profile.energy,
          brightness: flat.brightness ?? profile.brightness,
          danceability: flat.danceability ?? profile.danceability,
          acousticness: flat.acousticness ?? profile.acousticness,
          bpm: flat.bpm ?? profile.bpm,
          trace: [...(profile.trace ?? []), ...stamped],
        });
      }
      report.checked += 1;
      onProgress?.(report.checked, profiles.length);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return report;
}
