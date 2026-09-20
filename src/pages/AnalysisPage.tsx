import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PointCloud } from '../components/cloud/PointCloud';
import { MachineScan } from '../components/observer/MachineScan';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import {
  readingTimeFor,
  STEP_LABELS,
  STEP_PACING,
} from '../features/analysis/analysisSteps';
import {
  cloudConvergence,
  cloudSpeed,
  cloudStreams,
  sceneMood,
  stageResolution,
} from '../features/analysis/stageVisuals';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSongAnalysis } from '../hooks/useSongAnalysis';
import { useStagedReveal } from '../hooks/useStagedReveal';
import type { Reading } from '../features/observer/scanEnvelope';
import { AnalysisSteps } from './analysis/AnalysisSteps';
import './analysis.css';

/** Every stage except the terminal one, which is not work but an outcome. */
const TOTAL_STAGES = Object.keys(STEP_LABELS).length - 1;

export default function AnalysisPage() {
  const { songId } = useParams<{ songId: string }>();
  const decodedId = songId ? decodeURIComponent(songId) : undefined;
  const { state, song, error } = useSongAnalysis(decodedId);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const online = useOnlineStatus();

  const mood = useMemo(() => sceneMood(state), [state]);
  const resolution = stageResolution(state);
  const streams = useMemo(() => cloudStreams(state), [state]);
  const convergence = cloudConvergence(state);
  const speed = cloudSpeed(state);

  // The point cloud is the subject here and the field is also made of dots, so
  // the field runs coarse and dim to stay clearly behind it.
  useMoodEnvironment(mood, {
    resolution: resolution * 0.62,
    quality: 0.45,
    transitionMs: 1400,
  });

  // Completed stages are held back only long enough to be read. Each step holds
  // for as long as its own content takes; the work itself is never delayed.
  const completed = state?.completedStages ?? [];
  const revealedCount = useStagedReveal(completed, {
    holdFor: (stage) => readingTimeFor(state, stage),
    initialMs: STEP_PACING.initialMs,
    immediate: reducedMotion,
  });

  const finished =
    state?.stage === 'complete' &&
    Boolean(state.profile) &&
    revealedCount >= completed.length;

  /*
   * The machine's own working, taken straight from the run in progress. Every
   * line is a fact the pipeline has actually established by this point, which
   * is why the readout changes as the stages complete rather than cycling.
   */
  const readings = useMemo<Reading[]>(() => {
    if (!state) return [];
    const out: Reading[] = [
      { key: 'STAGE', value: state.stage.toUpperCase(), tier: 0 },
      {
        key: 'SOURCES',
        value: `${state.completedStages.length} / ${TOTAL_STAGES}`,
        tier: 0,
      },
    ];

    if (state.genres.length) {
      out.push({ key: 'GENRE', value: state.genres.slice(0, 3).join(' / '), tier: 1 });
    }
    if (state.communityTags.length) {
      out.push({
        key: 'TAGS',
        value: `${state.communityTags.length} RETRIEVED`,
        tier: 1,
      });
      out.push({
        key: 'VOCAB',
        value: state.communityTags.slice(0, 3).join(' / '),
        tier: 2,
      });
    }
    out.push({
      key: 'LYRICS',
      value: state.lyricsAvailable ? 'READ' : 'NOT FOUND',
      tier: 1,
    });
    if (state.lyricThemes.length) {
      out.push({ key: 'THEMES', value: state.lyricThemes.join(' / '), tier: 2 });
    }
    if (state.descriptors.length) {
      out.push({
        key: 'DESCRIPTORS',
        value: `${state.descriptors.length} MATCHED`,
        tier: 1,
      });
      out.push({
        key: 'CLASSIFY',
        value: state.descriptors.slice(0, 3).join(' / '),
        tier: 2,
      });
    }
    if (state.preparing) {
      out.push({
        key: 'MODEL',
        value: state.preparing.progress
          ? `LOADING ${Math.round(state.preparing.progress * 100)}%`
          : 'LOADING',
        tier: 0,
      });
    }
    if (state.notices.length) {
      out.push({ key: 'DEGRADED', value: `${state.notices.length}`, tier: 2 });
    }
    return out;
  }, [state]);

  // Only while the pipeline is genuinely running. It stops the moment the
  // reading is complete, rather than lingering over the result.
  const working = Boolean(state) && state?.stage !== 'complete' && !error;

  // The move to the fingerprint waits for the reading to become readable,
  // rather than for an arbitrary timer.
  useEffect(() => {
    if (!finished || !state?.profile) return;
    const timer = setTimeout(
      () =>
        navigate(`/result/${encodeURIComponent(state.profile!.songId)}`, {
          replace: true,
        }),
      reducedMotion ? 200 : 900,
    );
    return () => clearTimeout(timer);
  }, [finished, state?.profile, navigate, reducedMotion]);

  if (error) {
    return (
      <div className="page analysis analysis--error">
        <h1 className="u-title">{error}</h1>
        <p className="u-dim analysis__errorBody">
          Analysis needs to know which song it is looking at before it can start.
        </p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Try another song
        </Button>
      </div>
    );
  }

  return (
    <div className="page page--full analysis">
      <div className="analysis__scene">
        <div className="analysis__top">
          <button
            type="button"
            className="analysis__cancel"
            onClick={() => navigate('/')}
            aria-label="Cancel analysis"
          >
            ×
          </button>
        </div>

        <div className="analysis__stage">
          {/* The scan belongs to the stage area, which is empty but for the
              artwork: there is nothing here to obscure while it runs. */}
          <MachineScan
            active={working}
            label={song ? `${song.title} / ${song.artist}` : 'UNIDENTIFIED'}
            readings={readings}
          />
          <PointCloud
            streams={streams}
            hueA={mood.hueA}
            hueB={mood.hueB}
            convergence={convergence}
            speed={speed}
            quality={0.9}
          >
            <div className={`analysis__art${finished ? ' analysis__art--settled' : ''}`}>
              <div
                className="analysis__halo"
                style={{
                  background: `radial-gradient(circle, hsla(${mood.hueB}, 82%, 68%, ${
                    0.14 + resolution * 0.26
                  }), transparent 68%)`,
                }}
                aria-hidden="true"
              />
              {song && (
                <Artwork
                  src={song.artworkUrl}
                  seed={song.id}
                  size="min(32vw, 124px)"
                  radius="var(--r-lg)"
                  alt=""
                />
              )}
            </div>
          </PointCloud>
        </div>

        {song && (
          <div className="analysis__identity">
            <h1 className="u-section analysis__title">{song.title}</h1>
            <p className="u-meta">
              {[song.artist, song.year].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}

        <div className="analysis__steps u-scroll">
          <AnalysisSteps state={state} song={song} revealedCount={revealedCount} />
        </div>

        {!online && state?.stage !== 'complete' && (
          <p className="analysis__notice u-meta" role="status">
            You are offline, so we are working from what this device already knows
            about this song.
          </p>
        )}
      </div>
    </div>
  );
}
