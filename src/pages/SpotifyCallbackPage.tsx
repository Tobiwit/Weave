import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { Button } from '../components/ui/Button';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { completeSpotifyAuth, SpotifyAuthError } from '../services/spotify/auth';

/**
 * Where Spotify returns after sign-in.
 *
 * It exchanges the code and leaves. A dedicated route rather than the app root
 * because Supabase magic links also come back carrying a `code` parameter, and
 * two flows reading the same query string would eventually collide.
 */
export default function SpotifyCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.5, quality: 0.5 });

  useEffect(() => {
    let cancelled = false;

    completeSpotifyAuth(window.location.search)
      .then(() => {
        if (!cancelled) navigate('/playlists', { replace: true });
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof SpotifyAuthError
            ? caught.message
            : 'That sign-in did not complete.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="page callback">
      {error ? (
        <>
          <h1 className="u-section">{error}</h1>
          <Button variant="primary" onClick={() => navigate('/playlists')}>
            Back to playlists
          </Button>
        </>
      ) : (
        <p className="u-dim" role="status">
          Finishing the connection…
        </p>
      )}
    </div>
  );
}
