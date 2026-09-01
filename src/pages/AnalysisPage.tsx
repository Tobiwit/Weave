import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PointCloud } from '../components/cloud/PointCloud';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { readingTimeFor, STEP_PACING } from '../features/analysis/analysisSteps';
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
import { AnalysisSteps } from './analysis/AnalysisSteps';
import './analysis.css';

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
