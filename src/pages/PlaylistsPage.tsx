import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PlaylistMaterial } from '../components/playlist/PlaylistMaterial';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { COPY } from '../config/app';
import { getAllPlaylists } from '../db/repositories';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { LIBRARY_IMPORT_PROVIDERS } from '../services/spotify';
import './playlists.css';

export default function PlaylistsPage() {
  const playlists = useLiveQuery(() => getAllPlaylists(), [], []);
  const navigate = useNavigate();

  // Calmer than Analyze: the material stays well back on this screen.
  const mood = useMemo(() => ({ ...NEUTRAL_MOOD, density: 0.3, motion: 0.18 }), []);
  useMoodEnvironment(mood, { resolution: 0.5, quality: 0.7 });

  const importProvider = LIBRARY_IMPORT_PROVIDERS[0];

  return (
    <div className="page playlists">
      <div className="playlists__head">
        <h1 className="u-title">{COPY.playlistsHeading}</h1>
        <Button variant="quiet" size="sm" onClick={() => navigate('/playlists/new')}>
          + New
        </Button>
      </div>

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
              <Link to={`/playlists/${playlist.id}`} className="pl-row">
                <PlaylistMaterial playlist={playlist} size={62} />
                <span className="pl-row__text">
                  <span className="pl-row__name">{playlist.name}</span>
                  <span className="pl-row__desc u-meta">
                    {playlist.keywords.slice(0, 4).join(' · ')}
                  </span>
                </span>
                <span className="pl-row__count u-meta">
                  {playlist.songIds.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="playlists__foot">
        <Button
          variant="ghost"
          size="sm"
          disabled
          title={`${importProvider.id} import is not available yet`}
        >
          Import from Spotify — coming later
        </Button>
      </div>
    </div>
  );
}
