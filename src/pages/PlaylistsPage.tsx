import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PlaylistMaterial } from '../components/playlist/PlaylistMaterial';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { COPY } from '../config/app';
import { deletePlaylist, getAllPlaylists } from '../db/repositories';
import { rebuildLibraryRepresentation } from '../features/playlists/ensureVectors';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { ImportButton, ImportPanel } from './playlists/ImportPanel';
import './playlists.css';

export default function PlaylistsPage() {
  const playlists = useLiveQuery(() => getAllPlaylists(), [], []);
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [, setRecalcToken] = useState(0);
  const [managing, setManaging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Calmer than Analyze: the material stays well back on this screen.
  const mood = useMemo(() => ({ ...NEUTRAL_MOOD, density: 0.3, motion: 0.18 }), []);
  useMoodEnvironment(mood, { resolution: 0.5, quality: 0.7 });

  return (
    <div className="page playlists">
      <div className="playlists__head">
        <h1 className="u-title">{COPY.playlistsHeading}</h1>
        <div className="playlists__actions">
          {playlists.length > 0 && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setManaging((value) => !value);
                setConfirming(null);
              }}
            >
              {managing ? 'Done' : 'Manage'}
            </Button>
          )}
          <ImportButton onClick={() => setImporting(true)} />
          <Button variant="quiet" size="sm" onClick={() => navigate('/playlists/new')}>
            + New
          </Button>
        </div>
      </div>

      {playlists.length > 1 && (
        <Recalculate count={playlists.length} onDone={() => setRecalcToken((t) => t + 1)} />
      )}

      {importing && <ImportPanel onClose={() => setImporting(false)} />}

      {playlists.length === 0 ? (
        <EmptyState title="No playlists yet.">
          A playlist is a world you describe in your own words. Songs get matched
          against it.
        </EmptyState>
      ) : (
        <ul className="playlists__list">
          {playlists.map((playlist, index) => (
            <li
              key={playlist.id}
              className="u-rise"
              style={{ '--rise-delay': `${index * 50}ms` } as CSSProperties}
            >
              <div className="pl-row__wrap">
                <Link to={`/playlists/${playlist.id}`} className="pl-row">
                  <PlaylistMaterial playlist={playlist} size={62} />
                  <span className="pl-row__text">
                    <span className="pl-row__name">{playlist.name}</span>
                    <span className="pl-row__desc u-meta">
                      {playlist.keywords.slice(0, 4).join(' · ')}
                    </span>
                  </span>
                  {!managing && (
                    <span className="pl-row__count u-meta">
                      {playlist.songIds.length}
                    </span>
                  )}
                </Link>

                {managing && (
                  <span className="pl-row__manage">
                    {confirming === playlist.id ? (
                      <>
                        <button
                          type="button"
                          className="pl-row__delete pl-row__delete--armed"
                          onClick={() => {
                            void deletePlaylist(playlist.id).then(() =>
                              setConfirming(null),
                            );
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="pl-row__delete"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="pl-row__delete"
                        onClick={() => setConfirming(playlist.id)}
                        aria-label={`Delete ${playlist.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Rebuilds every playlist against the library as a whole.
 *
 * How much a word is worth depends on how many playlists carry it, so it is
 * not a property of any one playlist. Adding a rock playlist to a library of
 * indie pop changes what "indie pop" is worth everywhere at once, and only a
 * pass over all of them puts every playlist back in step. Rebuilding one
 * cannot do that, which is why this lives here rather than on each playlist.
 */
function Recalculate({ count, onDone }: { count: number; onDone: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [summary, setSummary] = useState<string | null>(null);

  const run = () => {
    setSummary(null);
    setProgress({ done: 0, total: count });
    void rebuildLibraryRepresentation((done, total) => setProgress({ done, total }))
      .then(({ reports, calibration }) => {
        const moved = reports.filter((report) => report.centroidShift > 0.0005);
        const songs = reports.reduce((sum, report) => sum + report.songs, 0);
        const rebuilt =
          moved.length === 0
            ? `Rebuilt ${reports.length} playlists over ${songs} readings. Nothing moved, so every playlist already meant what it means now.`
            : `Rebuilt ${reports.length} playlists over ${songs} readings. ${moved.length} shifted: ${moved
                .map((report) => report.playlist.name)
                .slice(0, 4)
                .join(', ')}.`;
        setSummary(
          calibration
            ? `${rebuilt} Score bands remeasured over ${calibration.samples} comparisons, so the numbers now use your library's own range.`
            : rebuilt,
        );
        onDone();
      })
      .catch(() => setSummary('Something went wrong rebuilding the library.'))
      .finally(() => setProgress(null));
  };

  return (
    <div className="playlists__recalc">
      <div className="playlists__recalcRow">
        <p className="u-meta playlists__recalcText">
          How distinctive a word is depends on how many of your playlists use
          it, so the weights are shared across all of them. Recalculate after
          importing or reading a lot.
        </p>
        <Button variant="quiet" size="sm" disabled={progress !== null} onClick={run}>
          {progress ? `${progress.done}/${progress.total}` : 'Recalculate'}
        </Button>
      </div>
      {summary && (
        <p className="u-meta playlists__recalcSummary" role="status">
          {summary}
        </p>
      )}
    </div>
  );
}
