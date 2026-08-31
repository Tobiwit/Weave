import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { FlowField } from '../components/flow/FlowField';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import {
  SCENE_NODES,
  STAGE_CAPTIONS,
  sceneConnections,
  sceneMood,
  stageResolution,
} from '../features/analysis/stageVisuals';
import { STAGE_PHASES } from '../features/analysis/types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSongAnalysis } from '../hooks/useSongAnalysis';
import { SignalCloud } from './analysis/SignalCloud';
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
  const connections = useMemo(() => sceneConnections(state), [state]);

  useMoodEnvironment(mood, { resolution, transitionMs: 1400 });

  // The reveal waits only for the work to finish; nothing is padded out.
  useEffect(() => {
    if (state?.stage !== 'complete' || !state.profile) return;
    const timer = setTimeout(
      () => navigate(`/result/${encodeURIComponent(state.profile!.songId)}`, { replace: true }),
      reducedMotion ? 200 : 1100,
    );
    return () => clearTimeout(timer);
  }, [state?.stage, state?.profile, navigate, reducedMotion]);

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

  const activePhase = STAGE_PHASES.findIndex((phase) =>
    phase.stages.includes(state?.stage ?? 'identify'),
  );

  return (
    <div className="page page--full analysis">
      <div className="analysis__flow">
        <FlowField
          nodes={SCENE_NODES}
          connections={connections}
          progress={state ? 1 : 0}
          particles={!reducedMotion}
          hueA={mood.hueA}
          hueB={mood.hueB}
        />
      </div>

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
          <ol className="phases" aria-label="Analysis progress">
            {STAGE_PHASES.map((phase, index) => (
              <li
                key={phase.id}
                className={`phases__item${
                  index < activePhase ? ' phases__item--done' : ''
                }${index === activePhase ? ' phases__item--active' : ''}`}
              >
                <span className="phases__dot" aria-hidden="true" />
                <span className="phases__label">{phase.label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="analysis__center">
          <div
            className={`analysis__art${
              state?.stage === 'complete' ? ' analysis__art--settled' : ''
            }`}
          >
            <div
              className="analysis__halo"
              style={{
                background: `radial-gradient(circle, hsla(${mood.hueB}, 80%, 66%, ${
                  0.16 + resolution * 0.3
                }), transparent 70%)`,
              }}
              aria-hidden="true"
            />
            {song && (
              <Artwork
                src={song.artworkUrl}
                seed={song.id}
                size="min(46vw, 190px)"
                radius="var(--r-xl)"
                alt=""
              />
            )}
          </div>

          {song && (
            <div className="analysis__identity">
              <h1 className="u-section analysis__title">{song.title}</h1>
              <p className="u-meta">
                {[song.artist, song.album, song.year].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
        </div>

        <SignalCloud state={state} />

        <div className="analysis__caption" aria-live="polite">
          {/* Keyed so each stage caption rises in as the previous one is
              replaced. A CSS reveal, so a throttled frame loop can never leave
              the sequence without a status line. */}
          <p key={state?.stage ?? 'identify'} className="u-dim u-rise">
            {state?.preparing
              ? preparingCopy(state.preparing.progress)
              : STAGE_CAPTIONS[state?.stage ?? 'identify']}
          </p>

          {!online && state?.stage !== 'complete' && (
            <p className="analysis__notice u-meta">
              You are offline, so we are working from what this device already
              knows about this song.
            </p>
          )}

          {online && state && state.notices.length > 0 && (
            <p className="analysis__notice u-meta">
              {state.notices[state.notices.length - 1].message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function preparingCopy(progress?: number): string {
  if (typeof progress !== 'number') return 'Preparing your analyzer';
  return `Preparing your analyzer · ${Math.round(progress * 100)}%`;
}
