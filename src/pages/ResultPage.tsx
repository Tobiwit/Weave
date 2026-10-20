import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { OrbitWeave } from '../components/brand/OrbitWeave';
import type { AxisPatch } from '../components/song/AxisPad';
import { AxisGroupPanel } from '../components/song/AxisGroupPanel';
import { AxisGroupTile } from '../components/song/AxisGroupTile';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { COPY } from '../config/app';
import { PROFILE_EMBEDDING_VERSION } from '../config/embedding';
import { addSongToPlaylist, setSongAxes } from '../db/repositories';
import { profileEmbeddingText } from '../features/matching';
import { moodStateFromProfile, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { ensureLibraryVectors } from '../features/playlists/ensureVectors';
import { matchSongToPlaylists } from '../features/playlists/playlistEngine';
import { AXIS_GROUPS, placedCount, type AxisGroupId, type AxisValues } from '../features/song/axes';
import { machineSuggestions } from '../features/song/axisReading';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSongProfile } from '../hooks/useSongProfile';
import { embeddingService } from '../services/embedding';
import type { Playlist, PlaylistMatch, SongProfile } from '../types';
import { Fingerprint } from './result/Fingerprint';
import { MatchList } from './result/MatchList';
import '../components/song/song.css';
import './result.css';

type Phase = 'review' | 'feel' | 'matching' | 'matches';

const STEPS: { id: Phase; label: string }[] = [
  { id: 'review', label: 'Reading' },
  { id: 'feel', label: 'Feel' },
  { id: 'matches', label: 'Place' },
];

/**
 * From a reading to a place, in three steps.
 *
 * Reading: the words the analysis chose, each editable. Feel: the eight scales,
 * opened on the machine's reading so you only touch what you disagree with.
 * Place: the playlists, best first, each with its score as a ring.
 */
export default function ResultPage() {
  const { songId } = useParams<{ songId: string }>();
  const decodedId = songId ? decodeURIComponent(songId) : undefined;
  const { profile, song, update, loading } = useSongProfile(decodedId);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('review');
  const [openGroup, setOpenGroup] = useState<AxisGroupId | null>(null);
  const [matches, setMatches] = useState<PlaylistMatch[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [matchError, setMatchError] = useState<string | null>(null);

  // Each step starts at its top; the app frame is what scrolls.
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [phase, reducedMotion]);

  const mood = useMemo(
    () => (profile ? moodStateFromProfile(profile) : NEUTRAL_MOOD),
    [profile],
  );
  useMoodEnvironment(mood, {
    resolution: phase === 'matches' || phase === 'matching' ? 1 : 0.7,
    quality: 1,
    transitionMs: 1400,
  });

  const runMatching = useCallback(async () => {
    if (!profile) return;
    setPhase('matching');
    setMatchError(null);
    const startedAt = Date.now();

    try {
      // Re-embed from the edited profile so corrections actually change
      // matching, by the same canonical recipe every other path uses.
      const semanticEmbedding = await embeddingService.embed(profileEmbeddingText(profile));
      await update({ semanticEmbedding, embeddingVersion: PROFILE_EMBEDDING_VERSION });

      const library = await ensureLibraryVectors();
      setPlaylists(library);

      const outcome = await matchSongToPlaylists({ ...profile, semanticEmbedding }, library);
      if (outcome.empty) {
        setMatchError(
          library.length === 0
            ? 'You have no playlists yet. Make one and this song will have somewhere to go.'
            : 'This song could not be compared right now.',
        );
      }
      setMatches(outcome.matches);

      // Long enough for the mark to come together, never longer.
      const elapsed = Date.now() - startedAt;
      const minimum = reducedMotion ? 0 : 1400;
      if (elapsed < minimum) await new Promise((r) => setTimeout(r, minimum - elapsed));
      setPhase('matches');
    } catch {
      setMatchError('This song could not be compared right now.');
      setPhase('matches');
    }
  }, [profile, update, reducedMotion]);

  const addTo = async (playlistId: string) => {
    await addSongToPlaylist(playlistId, decodedId ?? '');
    setAddedTo((current) => new Set(current).add(playlistId));
  };

  const playlistMap = useMemo(
    () => new Map(playlists.map((playlist) => [playlist.id, playlist])),
    [playlists],
  );

  if (loading) return <div className="page result" aria-busy="true" />;

  if (!profile || !song) {
    return (
      <div className="page result">
        <EmptyState title="That reading is no longer here.">
          Read the song again to rebuild it.
        </EmptyState>
        <div className="result__cta">
          <Button variant="primary" onClick={() => navigate('/')}>
            Read a song
          </Button>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((step) => step.id === (phase === 'matching' ? 'matches' : phase));

  return (
    <div className="page result">
      <header className="result__head">
        <Artwork src={song.artworkUrl} seed={song.id} size={56} alt="" />
        <div className="result__identity">
          <h1 className="result__title">{song.title}</h1>
          <p className="result__meta">
            {[
              song.artist,
              song.year,
              profile.measuredFields.includes('bpm') && profile.bpm
                ? `${Math.round(profile.bpm)} BPM`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      <ol className="stepper" aria-label="Steps">
        {STEPS.map((step, index) => (
          <li
            key={step.id}
            className={`stepper__step${index === stepIndex ? ' stepper__step--current' : ''}${
              index < stepIndex ? ' stepper__step--done' : ''
            }`}
            aria-current={index === stepIndex ? 'step' : undefined}
          >
            <button
              type="button"
              className="stepper__button"
              disabled={index > stepIndex || phase === 'matching'}
              onClick={() => setPhase(step.id === 'matches' ? 'matches' : step.id)}
            >
              <span className="stepper__arc" aria-hidden="true" />
              {step.label}
            </button>
          </li>
        ))}
      </ol>

      {phase === 'review' && (
        <section className="result__panel" key="review">
          <p className="result__preface">{COPY.fingerprintHeading}</p>
          <Fingerprint profile={profile} onChange={update} />
          <div className="result__cta">
            <Button variant="primary" block onClick={() => setPhase('feel')}>
              Next: how it feels
            </Button>
          </div>
        </section>
      )}

      {phase === 'feel' && (
        <FeelStep
          profile={profile}
          openGroup={openGroup}
          onOpen={setOpenGroup}
          onChange={(patch) => setSongAxes(profile.songId, patch)}
          onBack={() => setPhase('review')}
          onDone={runMatching}
        />
      )}

      {phase === 'matching' && (
        <section className="result__matching" aria-live="polite">
          <OrbitWeave className="result__matchingMark" size="100%" mode="working" progress={0.5} />
          <p className="result__matchingText">Finding its place</p>
        </section>
      )}

      {phase === 'matches' && (
        <section className="result__panel" key="matches">
          <h2 className="result__heading">Where it belongs</h2>
          {matchError ? (
            <EmptyState title={matchError}>
              {playlists.length === 0 && (
                <Button variant="quiet" onClick={() => navigate('/playlists/new')}>
                  Make a playlist
                </Button>
              )}
            </EmptyState>
          ) : (
            <MatchList
              matches={matches}
              playlists={playlistMap}
              onAdd={addTo}
              addedTo={addedTo}
            />
          )}
          <div className="result__foot">
            <Button variant="ghost" onClick={() => setPhase('feel')}>
              Adjust the feel
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(`/song/${encodeURIComponent(song.id)}`)}
            >
              Open the breakdown
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The eight scales in the main flow.
 *
 * Each pad opens on where the reading put the song, drawn faint with a ring.
 * Touching a pad makes that pair yours. Nothing has to be touched: "Looks
 * right" goes straight on, and the reading stands as the machine's opinion
 * rather than being copied in as if you had said it.
 */
function FeelStep({
  profile,
  openGroup,
  onOpen,
  onChange,
  onBack,
  onDone,
}: {
  profile: SongProfile;
  openGroup: AxisGroupId | null;
  onOpen: (id: AxisGroupId | null) => void;
  onChange: (patch: AxisPatch) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const values: AxisValues = profile.axes ?? {};
  const suggestions = useMemo(() => machineSuggestions(profile), [profile]);
  const placed = placedCount(values);

  return (
    <section className="result__panel result__panel--feel" key="feel">
      <h2 className="result__heading">How it feels</h2>
      <p className="result__hint">Our reading is in italics. Tap one to change it.</p>

      {/*
        Four at a glance, in pairs. The open one stays in its place, lit, and
        its full pad opens across both columns directly beneath its row, so
        nothing reorders.
      */}
      <div className="result__groups">
        {[AXIS_GROUPS.slice(0, 2), AXIS_GROUPS.slice(2, 4)].map((row) => {
          const open = row.find((group) => group.id === openGroup);
          return (
            <Fragment key={row[0].id}>
              {row.map((group) => (
                <AxisGroupTile
                  key={group.id}
                  group={group}
                  values={values}
                  suggestions={suggestions}
                  active={openGroup === group.id}
                  onOpen={() => onOpen(openGroup === group.id ? null : group.id)}
                />
              ))}
              {open && (
                <div className="result__groupOpen">
                  <AxisGroupPanel
                    group={open}
                    values={values}
                    suggestions={suggestions}
                    open
                    onToggle={() => onOpen(null)}
                    onChange={onChange}
                    highlighted={null}
                    onHighlight={() => undefined}
                    showValues={false}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="result__cta">
        <Button variant="primary" block onClick={onDone}>
          {placed > 0 ? 'Find its place' : 'Looks right, find its place'}
        </Button>
        <Button variant="ghost" block onClick={onBack}>
          Back to the reading
        </Button>
      </div>
    </section>
  );
}
