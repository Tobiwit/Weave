import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { OrbitWeave } from '../components/brand/OrbitWeave';
import { TraceList } from '../components/dev/TraceList';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { Disclosure } from '../components/ui/Disclosure';
import {
  readingTimeFor,
  STEP_ORDER,
  STEP_PACING,
} from '../features/analysis/analysisSteps';
import { sceneMood, stageResolution } from '../features/analysis/stageVisuals';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useRuntimeSettings } from '../hooks/useRuntimeSettings';
import { useSongAnalysis } from '../hooks/useSongAnalysis';
import { useStagedReveal } from '../hooks/useStagedReveal';
import { AnalysisSteps } from './analysis/AnalysisSteps';
import './analysis.css';

/**
 * The reading, shown as it happens.
 *
 * The mark is the subject: its arcs drift independently while nothing is
 * known and are drawn into one figure as each stage is revealed. Around it, a
 * ring of points lights one per stage. Below, every step says what it found.
 * The pacing comes from `useStagedReveal`, which only ever slows the display
 * of results that already exist, never the work.
 */
export default function AnalysisPage() {
  const { songId } = useParams<{ songId: string }>();
  const decodedId = songId ? decodeURIComponent(songId) : undefined;
  const { state, song, error } = useSongAnalysis(decodedId);
  const { devTrace } = useRuntimeSettings();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const online = useOnlineStatus();

  const mood = useMemo(() => sceneMood(state), [state]);
  const resolution = stageResolution(state);

  useMoodEnvironment(mood, { resolution, quality: 1, transitionMs: 1600 });

  const completed = state?.completedStages ?? [];
  const revealedCount = useStagedReveal(completed, {
    holdFor: (stage) => readingTimeFor(state, stage),
    initialMs: STEP_PACING.initialMs,
    immediate: reducedMotion,
  });

  const total = STEP_ORDER.length;
  const revealed = Math.min(revealedCount, total);
  const finished =
    state?.stage === 'complete' && Boolean(state.profile) && revealedCount >= completed.length;

  // With the trace showing, the run holds here so it can be read.
  useEffect(() => {
    if (!finished || !state?.profile || devTrace) return;
    const timer = setTimeout(
      () =>
        navigate(`/result/${encodeURIComponent(state.profile!.songId)}`, { replace: true }),
      reducedMotion ? 200 : 1100,
    );
    return () => clearTimeout(timer);
  }, [finished, state?.profile, navigate, reducedMotion, devTrace]);

  if (error) {
    return (
      <div className="page reading reading--error">
        <h1 className="u-title">{error}</h1>
        <p className="reading__errorBody">
          A reading needs to know which song it is looking at before it can start.
        </p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Try another song
        </Button>
      </div>
    );
  }

  return (
    <div className="page reading">
      <div className="reading__top">
        <button
          type="button"
          className="reading__close"
          onClick={() => navigate('/')}
          aria-label="Cancel reading"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
        {song && (
          <span className="reading__song">
            <Artwork src={song.artworkUrl} seed={song.id} size={36} alt="" />
            <span className="reading__songText">
              <span className="reading__songTitle">{song.title}</span>
              <span className="reading__songArtist">{song.artist}</span>
            </span>
          </span>
        )}
        <span className="reading__count" aria-live="polite">
          {revealed}/{total}
        </span>
      </div>

      <div className="reading__stage">
        <div className="reading__orbit">
          <StageDots total={total} lit={revealed} done={finished} />
          <OrbitWeave
            className="reading__mark"
            size="100%"
            mode={finished ? 'settled' : 'working'}
            progress={revealed / total}
            weight={0.9}
          />
        </div>
        <p className="reading__status" aria-live="polite">
          {finished
            ? 'Read'
            : state?.preparing
              ? 'Preparing the reader'
              : 'Reading'}
        </p>
      </div>

      <div className="reading__steps" data-step-scroller>
        <AnalysisSteps state={state} song={song} revealedCount={revealedCount} />
      </div>

      {devTrace && state && state.trace.length > 0 && (
        <div className="reading__trace">
          <Disclosure label="Show the working" note={`${state.trace.length} steps traced`}>
            <TraceList entries={state.trace} newestFirst />
          </Disclosure>
        </div>
      )}

      {devTrace && finished && state?.profile && (
        <div className="reading__continue">
          <Button
            variant="primary"
            onClick={() =>
              navigate(`/result/${encodeURIComponent(state.profile!.songId)}`, { replace: true })
            }
          >
            See where it belongs
          </Button>
        </div>
      )}

      {!online && state?.stage !== 'complete' && (
        <p className="reading__notice" role="status">
          You are offline, so this works from what the device already knows
          about the song.
        </p>
      )}
    </div>
  );
}

/** One point per stage on a circle around the mark; lit as each is revealed. */
function StageDots({ total, lit, done }: { total: number; lit: number; done: boolean }) {
  const dots = Array.from({ length: total * 8 }, (_, i) => i);
  return (
    <svg className={`reading__dots${done ? ' reading__dots--done' : ''}`} viewBox="-50 -50 100 100" aria-hidden="true">
      {dots.map((i) => {
        // Small points all the way round, like the reference's dotted gauge;
        // every eighth is a stage marker.
        const angle = (i / dots.length) * Math.PI * 2 - Math.PI / 2;
        const stage = i % 8 === 0 ? i / 8 : -1;
        const on = stage >= 0 ? stage < lit : i / 8 < lit;
        return (
          <circle
            key={i}
            cx={Math.cos(angle) * 48}
            cy={Math.sin(angle) * 48}
            r={stage >= 0 ? 1.5 : 0.55}
            className={`reading__dot${on ? ' reading__dot--on' : ''}${stage >= 0 ? ' reading__dot--stage' : ''}`}
          />
        );
      })}
    </svg>
  );
}
