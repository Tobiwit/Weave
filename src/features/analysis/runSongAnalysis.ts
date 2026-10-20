import { PROFILE_EMBEDDING_VERSION } from '../../config/embedding';
import { MATCHING_CONFIG } from '../../config/matching';
import { getSongProfile, saveSongProfile, upsertSong } from '../../db/repositories';
import { fetchArtwork } from '../../services/artwork';
import {
  fetchAudioEvidence,
  flatFeaturesFrom,
  measuredFieldsFrom,
  type ProviderTrace,
} from '../../services/audio';
import { embeddingService, subscribeToEmbeddingProgress } from '../../services/embedding';
import { fetchLyrics } from '../../services/lyrics';
import { fetchMetadata } from '../../services/metadata';
import { fetchCommunityTags } from '../../services/tags';
import type { AnalysisSource, AudioEvidence, Song, SongProfile, TraceEntry } from '../../types';
import { profileEmbeddingText } from '../matching';
import { AXES } from '../song/axes';
import { readAxes, readMeasuredAxes } from '../song/axisReading';
import { scoresRecord, type ScoredDescriptor } from './descriptorRanking';
import { interpretSignals, topOfGroup } from './interpretSignals';
import type { AnalysisListener, AnalysisNotice, AnalysisStage, AnalysisState } from './types';

export interface RunAnalysisOptions {
  onUpdate?: AnalysisListener;
  signal?: AbortSignal;
}

const round = (value: number, places = 2) =>
  Math.round(value * 10 ** places) / 10 ** places;

/** The strongest few of a ranking as `Label 0.41` pairs, for the trace. */
function topScores(ranked: ScoredDescriptor[], limit = 5): Record<string, number> {
  return Object.fromEntries(
    ranked.slice(0, limit).map((entry) => [entry.descriptor.label, round(entry.score, 3)]),
  );
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
      audioSources: [],
      descriptors: [],
      trace: [],
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

  /** Adds a line to the development trace, stamped with the current stage. */
  private trace(entry: ProviderTrace): void {
    const full: TraceEntry = { ...entry, stage: this.state.stage, at: Date.now() };
    this.emit({ trace: [...this.state.trace, full] });
  }

  getState(): AnalysisState {
    return this.state;
  }

  async run(signal?: AbortSignal): Promise<SongProfile> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    };
    const since = (started: number) => Math.round(performance.now() - started);

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
    this.trace({
      kind: 'derive',
      provider: song.source ?? 'search',
      status: 'ok',
      note: 'Identity as it arrived from search or import.',
      output: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        ...(song.mbid ? { mbid: song.mbid } : {}),
        ...(song.isrc ? { isrc: song.isrc } : {}),
      },
    });

    // Cover art is fetched first so the song has a face for the rest of the
    // run. It is a nicety, never a blocker: on failure the generated cover
    // stands in and nothing downstream notices.
    if (!song.artworkUrl) {
      const started = performance.now();
      const { artwork, providerId } = await fetchArtwork(song, signal);
      this.trace({
        kind: 'fetch',
        provider: providerId,
        request: `artwork for "${song.artist} ${song.title}"`,
        status: artwork ? (providerId === 'cache' ? 'cached' : 'ok') : providerId === 'none' ? 'skipped' : 'empty',
        ms: since(started),
        output: artwork
          ? {
              ...(artwork.album ? { album: artwork.album } : {}),
              ...(artwork.year ? { year: artwork.year } : {}),
            }
          : undefined,
        note: 'Artwork only. Album and year fill gaps; nothing here is analysed.',
      });
      if (artwork) {
        song = {
          ...song,
          artworkUrl: artwork.url,
          album: song.album ?? artwork.album,
          year: song.year ?? artwork.year,
        };
        this.recordSource({ kind: 'metadata', provider: providerId, ok: true });
        await upsertSong(song).catch(() => undefined);
        this.emit({ song });
      }
    }

    this.completeStage('identify');
    throwIfAborted();

    /* ----------------------------- metadata ------------------------------ */
    this.enterStage('metadata');
    let genres: string[] = [];
    {
      const started = performance.now();
      const request = `recording:"${song.title}" AND artist:"${song.artist}" (15)${
        song.mbid ? `, then rid:${song.mbid} if no match` : ''
      }`;
      try {
        const result = await fetchMetadata(song, signal);
        song = { ...song, ...result.patch };
        genres = result.genres;
        this.recordSource({ kind: 'metadata', provider: result.providerId, ok: true });
        this.trace({
          kind: 'fetch',
          provider: result.providerId,
          request,
          status: Object.keys(result.patch).length || genres.length ? 'ok' : 'empty',
          ms: since(started),
          // Only what the source returned, not what the song already carried.
          output: {
            ...Object.fromEntries(
              Object.entries(result.patch).filter(
                ([, value]) => typeof value === 'string' || typeof value === 'number',
              ) as [string, string | number][],
            ),
            ...(result.patch.altMbids
              ? {
                  'same song as': `${result.patch.altMbids.length} recordings, ${result.patch.altIsrcs?.length ?? 0} ISRCs`,
                }
              : {}),
            genres: genres.join(', ') || 'none',
          },
          note: 'By recording id when one is known, by title and artist if that finds nothing. Genres are the recording\'s top MusicBrainz tags by vote count.',
        });
        await upsertSong(song).catch(() => undefined);
        this.emit({ song, genres });
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        this.trace({
          kind: 'fetch',
          provider: 'musicbrainz',
          request,
          status: 'error',
          ms: since(started),
          note: (error as Error).message,
        });
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
    }
    this.completeStage('metadata');
    throwIfAborted();

    /* ----------------------------- community ----------------------------- */
    this.enterStage('community');
    let communityTags: string[] = [];
    {
      const started = performance.now();
      try {
        const result = await fetchCommunityTags(song, signal);
        communityTags = result.tags;
        this.recordSource({ kind: 'community', provider: result.providerId, ok: true });
        this.trace({
          kind: 'fetch',
          provider: result.providerId,
          request:
            result.providerId === 'lastfm'
              ? `track.getTopTags${result.detail?.usedArtist ? ' + artist.getTopTags' : ''}`
              : undefined,
          status: communityTags.length ? 'ok' : 'empty',
          ms: since(started),
          output: {
            kept: communityTags.length,
            ...(result.detail
              ? {
                  trackReturned: result.detail.trackRaw,
                  fromTrack: result.detail.fromTrack,
                  fromArtist: result.detail.fromArtist,
                }
              : {}),
            tags: communityTags.slice(0, 10).join(', ') || 'none',
          },
          note:
            result.note ??
            'Kept: used by at least 8 listeners, not on the noise list, at most 14. Artist tags fill in when a track has fewer than 5.',
        });
        this.emit({ communityTags });
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        this.trace({
          kind: 'fetch',
          provider: 'lastfm',
          status: 'error',
          ms: since(started),
          note: (error as Error).message,
        });
        this.recordSource({ kind: 'community', provider: 'lastfm', ok: false });
        this.addNotice({
          stage: 'community',
          message: 'Community tags are unavailable right now.',
        });
      }
    }
    this.completeStage('community');
    throwIfAborted();

    /* ------------------------------- lyrics ------------------------------ */
    this.enterStage('lyrics');
    let lyrics: string | null = null;
    {
      const started = performance.now();
      try {
        const result = await fetchLyrics(song, signal);
        lyrics = result.lyrics;
        this.recordSource({
          kind: 'lyrics',
          provider: result.providerId,
          ok: Boolean(lyrics),
          note: lyrics ? undefined : 'not found',
        });
        this.trace({
          kind: 'fetch',
          provider: result.providerId,
          request: `get track_name, artist_name${song.album ? ', album_name' : ''}`,
          status: lyrics ? 'ok' : 'empty',
          ms: since(started),
          output: lyrics ? { characters: lyrics.length } : undefined,
          note: 'Never stored or shown. Up to 600 characters are embedded on their own.',
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
        this.trace({
          kind: 'fetch',
          provider: 'lrclib',
          status: 'error',
          ms: since(started),
          note: (error as Error).message,
        });
        this.recordSource({ kind: 'lyrics', provider: 'lrclib', ok: false });
        this.addNotice({
          stage: 'lyrics',
          message: 'We could not read the lyrics for this one. The rest of the analysis can continue.',
        });
      }
    }
    this.completeStage('lyrics');
    throwIfAborted();

    /* ------------------------------- audio ------------------------------- */
    this.enterStage('audio');
    let audio: AudioEvidence = { checkedAt: Date.now() };
    try {
      const result = await fetchAudioEvidence(song, signal);
      audio = result.audio;
      for (const trace of result.traces) this.trace(trace);
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      // Measured audio is optional by design; absence is not a failure state.
    }

    const audioSources = (['reccobeats', 'acousticbrainz', 'mock'] as const).filter(
      (key) => Boolean(audio[key]),
    );
    for (const provider of audioSources) {
      this.recordSource({ kind: 'audio', provider, ok: true });
    }
    const measured = readMeasuredAxes(audio);
    this.trace({
      kind: 'derive',
      provider: 'axes from audio',
      status: Object.keys(measured).length ? 'ok' : 'empty',
      inputs: audioSources.length ? audioSources : ['no measured audio'],
      output: Object.fromEntries(
        Object.entries(measured).map(([axis, reading]) => [
          axis,
          `${round(reading.value)} (conf ${round(reading.confidence)})`,
        ]),
      ),
      note: Object.keys(measured).length
        ? 'Used to nudge descriptor selection; final axes are fused after interpretation.'
        : 'Nothing measured. Axes will rest on words alone, at low confidence.',
    });
    this.emit({ audioSources: [...audioSources] });
    this.completeStage('audio');
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
      interpretation = await interpretSignals({
        song,
        genres,
        communityTags,
        lyrics,
        measured,
      });
      this.recordSource({ kind: 'interpretation', provider: 'descriptors', ok: true });
    } finally {
      unsubscribe();
      this.emit({ preparing: undefined });
    }

    const shares = MATCHING_CONFIG.descriptors.lyricShare;
    this.trace({
      kind: 'derive',
      provider: 'descriptors from signals',
      status: 'ok',
      inputs: [interpretation.signalText],
      output: topScores(interpretation.signalRanked),
      note: 'Cosine of the signal text against all 64 descriptor definitions (MiniLM).',
    });
    if (interpretation.lyricRanked) {
      this.trace({
        kind: 'derive',
        provider: 'descriptors from lyrics',
        status: 'ok',
        inputs: [`${interpretation.lyricChars} characters of lyrics`],
        output: topScores(interpretation.lyricRanked),
      });
      // Lyric themes come from the lyrics alone, so the Lyrics moment can
      // reveal what they contributed, separately from everything else.
      this.emit({
        lyricThemes: topOfGroup(interpretation.lyricRanked, 'theme', 3).map(
          (entry) => entry.descriptor.label,
        ),
      });
    }
    this.trace({
      kind: 'derive',
      provider: 'blend + audio nudge',
      status: 'ok',
      inputs: [
        `lyric share: mood ${shares.mood}, vibe ${shares.vibe}, theme ${shares.theme}, texture ${shares.texture}`,
        Object.keys(measured).length
          ? `audio nudge ±${MATCHING_CONFIG.descriptors.audioNudge}, veto at ${MATCHING_CONFIG.descriptors.audioVeto.distance} off with conf ≥ ${MATCHING_CONFIG.descriptors.audioVeto.confidence}, from ${audioSources.join(', ')}`
          : 'no audio nudge',
      ],
      output: {
        mood: interpretation.mood ?? 'none',
        vibes: interpretation.vibes.join(', ') || 'none',
        themes: interpretation.themes.join(', ') || 'none',
        'energy (inferred)': round(interpretation.energy),
        'intensity (inferred)': round(interpretation.intensity),
        vetoed:
          interpretation.ranked
            .filter((entry) => entry.vetoed)
            .map((entry) => entry.descriptor.label)
            .join(', ') || 'none',
      },
      note: 'Vetoed: contradicts a confident measurement on an axis it speaks to.',
    });

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
    const flat = flatFeaturesFrom(audio);
    const now = Date.now();

    // A re-read refreshes what the machine thinks; it must never erase what
    // the person said. Hand edits and hand-placed scales carry over.
    const previous = await getSongProfile(song.id).catch(() => undefined);

    const profile: SongProfile = {
      songId: song.id,
      genres,
      communityTags,
      themes: interpretation.themes,
      vibes: interpretation.vibes,
      mood: interpretation.mood,
      energy: flat.energy ?? interpretation.energy,
      intensity: interpretation.intensity,
      brightness: flat.brightness,
      danceability: flat.danceability,
      acousticness: flat.acousticness,
      bpm: flat.bpm,
      measuredFields: measuredFieldsFrom(audio),
      audio,
      reading: {
        signal: scoresRecord(interpretation.signalRanked),
        lyrics: interpretation.lyricRanked
          ? scoresRecord(interpretation.lyricRanked)
          : undefined,
        mood: interpretation.mood,
      },
      manualTags: previous?.manualTags ?? [],
      removedTags: previous?.removedTags ?? [],
      axes: previous?.axes,
      sources: this.sources,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    const axes = readAxes(profile);
    this.trace({
      kind: 'derive',
      provider: 'axes (fused)',
      status: 'ok',
      inputs: ['measured audio', 'descriptor ranking', 'lyric ranking', 'hand placements'],
      output: Object.fromEntries(
        AXES.map(({ id }) => [
          id,
          `${round(axes[id].value)} ${axes[id].origin} via ${axes[id].primary} (conf ${round(axes[id].confidence)})`,
        ]),
      ),
      note: 'Confidence-weighted mean of every source; a hand-placed axis replaces it.',
    });

    // The vector is built from the reading, not from the raw signals that
    // produced it, and always by the one canonical recipe.
    const embeddingText = profileEmbeddingText(profile);
    profile.semanticEmbedding = await embeddingService.embed(embeddingText);
    profile.embeddingVersion = PROFILE_EMBEDDING_VERSION;
    this.trace({
      kind: 'derive',
      provider: 'profile embedding',
      status: 'ok',
      inputs: [embeddingText],
      output: {
        dimensions: profile.semanticEmbedding.length,
        recipe: `v${PROFILE_EMBEDDING_VERSION}`,
      },
    });

    profile.trace = this.state.trace;
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
