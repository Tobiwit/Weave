import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { createPlaylistFromImport } from '../../features/playlists/importPlaylist';
import {
  importPublicPlaylist,
  isSpotifyImportAvailable,
  SpotifyImportError,
  type ImportedPlaylist,
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
          ? 'Import a public Spotify playlist from a link'
          : 'Spotify import needs the cloud settings configured for this build'
      }
    >
      Import
    </Button>
  );
}

type Phase = 'link' | 'preview' | 'working';

/**
 * Import a public Spotify playlist from a link.
 *
 * The link is fetched, then previewed before anything is written: an import
 * that silently created a playlist you did not expect would be worse than one
 * extra tap. Only track identity comes across; the reading is Weave's own.
 */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('link');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedPlaylist | null>(null);
  const navigate = useNavigate();

  const lookUp = async () => {
    setError(null);
    setPhase('working');
    try {
      const result = await importPublicPlaylist(link);
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
      setPhase('link');
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
      ) : (
        <>
          <label className="u-eyebrow import__label" htmlFor="spotify-link">
            Paste a public Spotify playlist link
          </label>
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
              onClick={lookUp}
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
