import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { FlowField, type FlowConnection, type FlowNode } from '../components/flow/FlowField';
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
import { ProfileEditor } from './result/ProfileEditor';
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
  useMoodEnvironment(mood, {
    resolution: phase === 'review' ? 1 : 0.92,
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
            {[song.artist, song.year].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      {phase === 'review' ? (
        <div className="result__review">
          <h2 className="u-hero result__heading">{COPY.fingerprintHeading}</h2>

          <ProfileEditor profile={profile} onChange={update} />

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
 * The attraction moment: the song contracts to one point and playlist regions
 * lean toward it, with thread strength following similarity.
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
    const timer = setTimeout(() => setVisible(false), 1400);
    return () => clearTimeout(timer);
  }, [settled]);

  const { nodes, connections } = useMemo(() => {
    const ring: FlowNode[] = [{ id: 'song', x: 0.5, y: 0.46, intensity: 1 }];
    const links: FlowConnection[] = [];
    const count = Math.max(matches.length, 3);

    matches.slice(0, 6).forEach((match, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      // Stronger matches sit closer, so proximity reads as attraction.
      const radius = 0.46 - (match.score / 100) * 0.16;
      ring.push({
        id: match.playlistId,
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.46 + Math.sin(angle) * radius * 0.85,
        intensity: match.score / 100,
      });
      links.push({
        from: match.playlistId,
        to: 'song',
        strength: 0.2 + (match.score / 100) * 0.8,
        active: match.score >= 45,
      });
    });

    return { nodes: ring, connections: links };
  }, [matches]);

  if (!visible) return null;

  return (
    <motion.div
      className="result__reveal"
      initial={{ opacity: 0 }}
      animate={{ opacity: settled ? 0 : 1 }}
      transition={{ duration: settled ? 1.2 : 0.6 }}
      aria-hidden="true"
    >
      <FlowField
        nodes={nodes}
        connections={connections}
        progress={matches.length > 0 ? 1 : 0}
        particles
        hueA={mood.hueA}
        hueB={mood.hueB}
      />
    </motion.div>
  );
}
