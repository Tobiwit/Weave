import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PointCloud } from '../components/cloud/PointCloud';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { COPY } from '../config/app';
import { addSongToPlaylist } from '../db/repositories';
import { ensureLibraryVectors } from '../features/playlists/ensureVectors';
import { matchSongToPlaylists } from '../features/playlists/playlistEngine';
import { activeProfileTerms, profileEmbeddingText } from '../features/matching';
import { moodStateFromProfile, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { embeddingService } from '../services/embedding';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSongProfile } from '../hooks/useSongProfile';
import type { Playlist, PlaylistMatch } from '../types';
import { MatchList } from './result/MatchList';
import { Fingerprint } from './result/Fingerprint';
import './result.css';

type Phase = 'review' | 'matching' | 'matches';

export default function ResultPage() {
  const { songId } = useParams<{ songId: string }>();
  const decodedId = songId ? decodeURIComponent(songId) : undefined;
  const { profile, song, update, loading } = useSongProfile(decodedId);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('review');
  const [matches, setMatches] = useState<PlaylistMatch[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [matchError, setMatchError] = useState<string | null>(null);

  const mood = useMemo(
    () => (profile ? moodStateFromProfile(profile) : NEUTRAL_MOOD),
    [profile],
  );
  // The reading is dense text, so the field steps back behind it. It returns
  // to full strength for the match reveal, where it is the whole event.
  useMoodEnvironment(mood, {
    resolution: phase === 'review' ? 0.55 : 0.95,
    quality: phase === 'review' ? 0.5 : 0.9,
    transitionMs: 1200,
  });

  const runMatching = useCallback(async () => {
    if (!profile) return;
    setPhase('matching');
    setMatchError(null);
    const startedAt = Date.now();

    try {
      // Re-embed from the edited profile so corrections actually change matching.
      const semanticEmbedding = await embeddingService.embed(
        profileEmbeddingText({
          ...profile,
          vibes: activeProfileTerms(profile),
        }),
      );
      await update({ semanticEmbedding });

      const library = await ensureLibraryVectors();
      setPlaylists(library);

      const outcome = await matchSongToPlaylists(
        { ...profile, semanticEmbedding },
        library,
      );

      if (outcome.empty) {
        setMatchError(
          library.length === 0
            ? 'You have no playlists yet. Create one and this song will have somewhere to go.'
            : 'We could not compare this song right now.',
        );
      }
      setMatches(outcome.matches);

      // Let the reveal breathe when the maths finishes almost instantly.
      const elapsed = Date.now() - startedAt;
      const minimum = reducedMotion ? 0 : 1500;
      if (elapsed < minimum) {
        await new Promise((resolve) => setTimeout(resolve, minimum - elapsed));
      }
      setPhase('matches');
    } catch {
      setMatchError('We could not compare this song right now.');
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

  if (loading) {
    return <div className="page result" aria-busy="true" />;
  }

  if (!profile || !song) {
    return (
      <div className="page result">
        <EmptyState title="That analysis is no longer here.">
          Analyze the song again to rebuild its fingerprint.
        </EmptyState>
        <Button variant="primary" onClick={() => navigate('/')}>
          Back to Analyze
        </Button>
      </div>
    );
  }

  return (
    <div className="page result">
      {phase !== 'review' && (
        <MatchReveal matches={matches} settled={phase === 'matches'} mood={mood} />
      )}

      <header className="result__head">
        <Artwork src={song.artworkUrl} seed={song.id} size={64} alt="" />
        <div className="result__identity">
          <h1 className="u-section">{song.title}</h1>
          <p className="u-meta">
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

      {phase === 'review' ? (
        <div className="result__review">
          {/* The mood below is the headline; this is only its preface. */}
          <p className="result__preface">{COPY.fingerprintHeading}</p>

          <Fingerprint profile={profile} onChange={update} />

          <div className="result__cta">
            <p className="u-dim result__confirm">{COPY.confirmHeading}</p>
            <Button variant="primary" block onClick={runMatching}>
              {COPY.matchCta}
            </Button>
          </div>
        </div>
      ) : (
        <div className="result__matches">
          <h2 className="u-title result__heading">
            {phase === 'matching' ? 'Finding its place' : 'Best matches'}
          </h2>

          {phase === 'matches' && matchError && (
            <EmptyState title={matchError}>
              {playlists.length === 0 && (
                <Button variant="quiet" onClick={() => navigate('/playlists/new')}>
                  Create a playlist
                </Button>
              )}
            </EmptyState>
          )}

          {phase === 'matches' && !matchError && (
            <>
              <MatchList
                matches={matches}
                playlists={playlistMap}
                onAdd={addTo}
                addedTo={addedTo}
              />
              <div className="result__foot">
                <Button variant="quiet" onClick={() => setPhase('review')}>
                  Adjust the reading
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The attraction moment.
 *
 * The song's own material contracts and then disperses toward the playlists it
 * belongs with. Strength is carried by how much of the field arrives and how
 * tightly it gathers, not by drawing a line to each destination: lines turn an
 * atmosphere into a network diagram.
 */
function MatchReveal({
  matches,
  settled,
  mood,
}: {
  matches: PlaylistMatch[];
  settled: boolean;
  mood: { hueA: number; hueB: number };
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(timer);
  }, [settled]);

  // One stream per candidate playlist, arriving in proportion to its score, so
  // a strong field means a strong set of matches.
  const streams = useMemo(() => {
    if (matches.length === 0) return [0.35, 0.2, 0.1];
    return matches.slice(0, 6).map((match) => 0.25 + (match.score / 100) * 0.75);
  }, [matches]);

  if (!visible) return null;

  return (
    <div
      className={`result__reveal${settled ? ' result__reveal--settling' : ''}`}
      aria-hidden="true"
    >
      <PointCloud
        streams={streams}
        hueA={mood.hueA}
        hueB={mood.hueB}
        convergence={settled ? 1 : 0.35}
        speed={settled ? 0.3 : 0.85}
        quality={0.75}
      />
    </div>
  );
}
