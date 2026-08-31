import { saveSongProfile, upsertSong } from '../../db/repositories';
import { fetchAudioFeatures, measuredFieldsFrom } from '../../services/audio';
import { embeddingService, subscribeToEmbeddingProgress } from '../../services/embedding';
import { fetchLyrics } from '../../services/lyrics';
import { fetchMetadata } from '../../services/metadata';
import { fetchCommunityTags } from '../../services/tags';
import type { AnalysisSource, Song, SongProfile } from '../../types';
import { getDescriptorVectors, interpretSignals, rankDescriptors, topOfGroup } from './interpretSignals';
import type { AnalysisListener, AnalysisNotice, AnalysisStage, AnalysisState } from './types';

export interface RunAnalysisOptions {
  onUpdate?: AnalysisListener;
  signal?: AbortSignal;
}

class AnalysisRun {
  private state: AnalysisState;
  private readonly listener?: AnalysisListener;
  private readonly sources: AnalysisSource[] = [];

  constructor(song: Song, options: RunAnalysisOptions) {
    this.listener = options.onUpdate;
    this.state = {
      song,
      stage: 'identify',
      completedStages: [],
      genres: [],
      communityTags: [],
      lyricsAvailable: false,
      lyricThemes: [],
      descriptors: [],
      notices: [],
      startedAt: Date.now(),
    };
  }

  private emit(patch: Partial<AnalysisState>): void {
    this.state = { ...this.state, ...patch };
    this.listener?.(this.state);
  }

  private enterStage(stage: AnalysisStage): void {
    this.emit({ stage });
  }

  private completeStage(stage: AnalysisStage): void {
    if (this.state.completedStages.includes(stage)) return;
    this.emit({ completedStages: [...this.state.completedStages, stage] });
  }

  private addNotice(notice: AnalysisNotice): void {
    this.emit({ notices: [...this.state.notices, notice] });
  }

  private recordSource(source: Omit<AnalysisSource, 'at'>): void {
    this.sources.push({ ...source, at: Date.now() });
  }

  getState(): AnalysisState {
    return this.state;
  }

  async run(signal?: AbortSignal): Promise<SongProfile> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    };

    /* ----------------------------- identify ------------------------------ */
    this.enterStage('identify');
    let song = this.state.song;
    if (!song.title.trim() || !song.artist.trim()) {
      // Identity is the one thing analysis cannot continue without.
      this.emit({ fatalError: 'We could not identify this song.' });
      throw new Error('Song identity could not be established');
    }
    await upsertSong(song).catch(() => undefined);
    this.recordSource({ kind: 'metadata', provider: song.source ?? 'search', ok: true });
    this.completeStage('identify');
    throwIfAborted();

    /* ----------------------------- metadata ------------------------------ */
    this.enterStage('metadata');
    let genres: string[] = [];
    try {
      const result = await fetchMetadata(song, signal);
      song = { ...song, ...result.patch };
      genres = result.genres;
      this.recordSource({ kind: 'metadata', provider: result.providerId, ok: true });
      await upsertSong(song).catch(() => undefined);
      this.emit({ song, genres });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      this.recordSource({
        kind: 'metadata',
        provider: 'musicbrainz',
        ok: false,
        note: 'unavailable',
      });
      this.addNotice({
        stage: 'metadata',
        message: 'Release details are unavailable right now.',
      });
    }
    this.completeStage('metadata');
    throwIfAborted();

    /* ----------------------------- community ----------------------------- */
    this.enterStage('community');
    let communityTags: string[] = [];
    try {
      const result = await fetchCommunityTags(song, signal);
      communityTags = result.tags;
      this.recordSource({ kind: 'community', provider: result.providerId, ok: true });
      this.emit({ communityTags });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      this.recordSource({ kind: 'community', provider: 'lastfm', ok: false });
      this.addNotice({
        stage: 'community',
        message: 'Community tags are unavailable right now.',
      });
    }
    this.completeStage('community');
    throwIfAborted();

    /* ------------------------------- lyrics ------------------------------ */
    this.enterStage('lyrics');
    let lyrics: string | null = null;
    try {
      const result = await fetchLyrics(song, signal);
      lyrics = result.lyrics;
      this.recordSource({
        kind: 'lyrics',
        provider: result.providerId,
        ok: Boolean(lyrics),
        note: lyrics ? undefined : 'not found',
      });
      this.emit({ lyricsAvailable: Boolean(lyrics) });
      if (!lyrics) {
        this.addNotice({
          stage: 'lyrics',
          message: 'We could not read the lyrics for this one. The rest of the analysis can continue.',
        });
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      this.recordSource({ kind: 'lyrics', provider: 'lrclib', ok: false });
      this.addNotice({
        stage: 'lyrics',
        message: 'We could not read the lyrics for this one. The rest of the analysis can continue.',
      });
    }

    /* --------------------- audio features, when real --------------------- */
    let features = null;
    try {
      const result = await fetchAudioFeatures(song, signal);
      features = result.features;
      if (features) {
        this.recordSource({ kind: 'audio', provider: result.providerId, ok: true });
      }
    } catch {
      // Measured audio is optional by design; absence is not a failure state.
    }
    this.completeStage('lyrics');
    throwIfAborted();

    /* ----------------------------- interpret ----------------------------- */
    this.enterStage('interpret');
    const unsubscribe = subscribeToEmbeddingProgress((progress) => {
      if (progress.status === 'downloading') {
        this.emit({ preparing: { progress: progress.progress } });
      } else {
        this.emit({ preparing: undefined });
      }
    });

    let interpretation;
    try {
      // Lyric themes are derived from the lyrics alone so the Lyrics moment can
      // reveal what they contributed, separately from everything else.
      if (lyrics) {
        try {
          const [lyricVector, descriptorVectors] = await Promise.all([
            embeddingService.embed(lyrics.replace(/\s+/g, ' ').slice(0, 600)),
            getDescriptorVectors(),
          ]);
          const lyricThemes = topOfGroup(
            rankDescriptors(lyricVector, descriptorVectors),
            'theme',
            3,
          ).map((entry) => entry.descriptor.label);
          this.emit({ lyricThemes });
        } catch {
          // Non-fatal: the full interpretation below still uses the lyrics.
        }
      }

      interpretation = await interpretSignals({
        song,
        genres,
        communityTags,
        lyrics,
      });
      this.recordSource({ kind: 'interpretation', provider: 'descriptors', ok: true });
    } finally {
      unsubscribe();
      this.emit({ preparing: undefined });
    }

    this.emit({
      descriptors: [
        ...(interpretation.mood ? [interpretation.mood] : []),
        ...interpretation.vibes,
        ...interpretation.themes,
      ],
    });
    this.completeStage('interpret');
    throwIfAborted();

    /* ---------------------------- fingerprint ---------------------------- */
    this.enterStage('fingerprint');
    const measuredFields = measuredFieldsFrom(features);
    const now = Date.now();

    const profile: SongProfile = {
      songId: song.id,
      genres,
      communityTags,
      themes: interpretation.themes,
      vibes: interpretation.vibes,
      mood: interpretation.mood,
      energy: features?.energy ?? interpretation.energy,
      intensity: interpretation.intensity,
      brightness: features?.brightness,
      danceability: features?.danceability,
      acousticness: features?.acousticness,
      bpm: features?.bpm,
      measuredFields,
      semanticEmbedding: interpretation.embedding,
      manualTags: [],
      removedTags: [],
      sources: this.sources,
      createdAt: now,
      updatedAt: now,
    };

    await saveSongProfile(profile);
    this.emit({ profile });
    this.completeStage('fingerprint');

    this.enterStage('complete');
    this.completeStage('complete');
    this.emit({ finishedAt: Date.now() });
    return profile;
  }
}

/**
 * Runs the full analysis pipeline for a song.
 *
 * Every stage except identification degrades gracefully: a missing signal adds
 * a human-readable notice and the pipeline continues.
 */
export async function runSongAnalysis(
  song: Song,
  options: RunAnalysisOptions = {},
): Promise<SongProfile> {
  const run = new AnalysisRun(song, options);
  return run.run(options.signal);
}
