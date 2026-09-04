import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Artwork } from '../../components/ui/Artwork';
import { Button } from '../../components/ui/Button';
import { createPlaylistFromImport } from '../../features/playlists/importPlaylist';
import {
  connectSpotify,
  importPublicPlaylist,
  isSpotifyConnected,
  isSpotifyImportAvailable,
  listMyPlaylists,
  SpotifyImportError,
  subscribeToSpotifyAuth,
  type ImportedPlaylist,
  type PlaylistSummary,
} from '../../services/spotify';

/** The trigger, which lives beside "+ New" so import reads as a peer action. */
export function ImportButton({ onClick }: { onClick: () => void }) {
  const available = isSpotifyImportAvailable();
  return (
    <Button
      variant="quiet"
      size="sm"
      onClick={onClick}
      disabled={!available}
      title={
        available
          ? 'Import a Spotify playlist from a link'
          : 'Spotify import needs VITE_SPOTIFY_CLIENT_ID set for this build'
      }
    >
      Import
    </Button>
  );
}

type Phase = 'mine' | 'link' | 'preview' | 'working';

/**
 * Import a public Spotify playlist from a link.
 *
 * The link is fetched, then previewed before anything is written: an import
 * that silently created a playlist you did not expect would be worse than one
 * extra tap. Only track identity comes across; the reading is Weave's own.
 */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('mine');
  const [mine, setMine] = useState<PlaylistSummary[] | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedPlaylist | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void isSpotifyConnected().then(setConnected);
    return subscribeToSpotifyAuth(setConnected);
  }, []);

  // Once connected, your own playlists are a better starting point than an
  // empty URL field. A link is still accepted for anything not in the list.
  useEffect(() => {
    if (connected !== true || mine !== null) return;
    listMyPlaylists()
      .then(setMine)
      .catch(() => setMine([]));
  }, [connected, mine]);

  const lookUp = async (source = link) => {
    setError(null);
    setPhase('working');
    try {
      const result = await importPublicPlaylist(source);
      if (result.tracks.length === 0) {
        setError('That playlist has no tracks we can read.');
        setPhase('link');
        return;
      }
      setImported(result);
      setPhase('preview');
    } catch (caught) {
      setError(
        caught instanceof SpotifyImportError
          ? caught.message
          : 'Something went wrong reading that link.',
      );
      setPhase(source === link ? 'link' : 'mine');
    }
  };

  const save = async () => {
    if (!imported) return;
    setPhase('working');
    try {
      // Seeded from the playlist's own words; the user can shape it after.
      const keywords = imported.description
        ? imported.description
            .split(/[,·|]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
      const playlist = await createPlaylistFromImport(imported, keywords);
      navigate(`/playlists/${playlist.id}`);
    } catch {
      setError('We could not save that playlist.');
      setPhase('preview');
    }
  };

  // Spotify will not let an app token read playlist contents, so the listener
  // connects their own account once. Public and private playlists both work
  // after that.
  if (connected === false) {
    return (
      <section className="import u-rise" aria-label="Connect Spotify">
        <p className="u-meta import__connect">
          Spotify only lets an account read its own playlists, so connect yours
          once. Weave takes the track names and reads the songs itself.
        </p>
        <div className="import__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void connectSpotify().catch(() =>
                setError('We could not open Spotify sign-in.'),
              );
            }}
          >
            Connect Spotify
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
        {error && (
          <p className="import__error u-meta" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="import u-rise" aria-label="Import from Spotify">
      {phase === 'preview' && imported ? (
        <>
          <p className="import__title">{imported.name}</p>
          <p className="u-meta import__meta">
            {imported.tracks.length} tracks
            {imported.truncated && ' · first 500 only'}
          </p>
          <p className="u-meta import__note">
            We bring across what each track is. The reading of each song is ours
            to make, and happens when you ask for it.
          </p>
          <div className="import__actions">
            <Button variant="primary" size="sm" onClick={save}>
              Add to my playlists
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPhase('link')}>
              Back
            </Button>
          </div>
        </>
      ) : phase === 'mine' ? (
        <>
          <div className="import__head">
            <p className="u-eyebrow import__label">Your Spotify playlists</p>
            <Button variant="ghost" size="sm" onClick={() => setPhase('link')}>
              Use a link
            </Button>
          </div>

          {mine === null ? (
            <p className="u-meta">Loading your playlists…</p>
          ) : mine.length === 0 ? (
            <p className="u-meta import__connect">
              No playlists came back. You can still paste a link to any playlist.
            </p>
          ) : (
            <ul className="import__list u-scroll">
              {mine.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className="import__row"
                    onClick={() => void lookUp(playlist.id)}
                  >
                    <Artwork src={playlist.coverUrl} seed={playlist.id} size={40} alt="" />
                    <span className="import__rowText">
                      <span className="import__rowName">{playlist.name}</span>
                      <span className="import__rowMeta u-meta">
                        {playlist.trackCount}{' '}
                        {playlist.trackCount === 1 ? 'track' : 'tracks'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="import__actions">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="import__head">
            <label className="u-eyebrow import__label" htmlFor="spotify-link">
              Paste a Spotify playlist link
            </label>
            <Button variant="ghost" size="sm" onClick={() => setPhase('mine')}>
              My playlists
            </Button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void lookUp();
            }}
          >
            <input
              id="spotify-link"
              className="import__input"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://open.spotify.com/playlist/…"
              autoComplete="off"
              spellCheck={false}
              inputMode="url"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </form>
          <div className="import__actions">
            <Button
              variant="primary"
              size="sm"
              disabled={!link.trim() || phase === 'working'}
              onClick={() => void lookUp()}
            >
              {phase === 'working' ? 'Reading…' : 'Look it up'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {error && (
        <p className="import__error u-meta" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
