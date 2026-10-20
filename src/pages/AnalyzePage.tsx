import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { OrbitWeave } from '../components/brand/OrbitWeave';
import { Notice } from '../components/ui/Notice';
import { SearchField } from '../components/ui/SearchField';
import { SongRow } from '../components/ui/SongRow';
import { APP, COPY } from '../config/app';
import { getRecentSongs, upsertSong } from '../db/repositories';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSongSearch } from '../hooks/useSongSearch';
import type { Song } from '../types';
import './analyze.css';

export default function AnalyzePage() {
  const [query, setQuery] = useState('');
  const { results, loading, degraded } = useSongSearch(query);
  const navigate = useNavigate();

  const recents = useLiveQuery(() => getRecentSongs(5), [], []);
  const online = useOnlineStatus();

  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.9, quality: 1 });

  const startAnalysis = async (song: Song) => {
    await upsertSong(song).catch(() => undefined);
    navigate(`/analysis/${encodeURIComponent(song.id)}`);
  };

  const searching = query.trim().length >= 2;

  return (
    <div className={`page analyze${searching ? ' analyze--searching' : ''}`}>
      <header className="analyze__top">
        <span className="brand">
          <span className="brand__name">{APP.name}</span>
        </span>
        <Link to="/settings" className="analyze__settings" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M19 12a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
            <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </Link>
      </header>

      {/* The mark is the opening: it turns slowly until a song is chosen. */}
      <div className="analyze__hero">
        <OrbitWeave className="analyze__mark" size="100%" mode={loading ? 'working' : 'idle'} />
        <h1 className="analyze__heading">{COPY.analyzeHeading}</h1>
      </div>

      {!online && (
        <div className="analyze__offline">
          <Notice>
            You are offline. Everything already read stays browsable; a new
            song needs a connection.
          </Notice>
        </div>
      )}

      <div className="analyze__search">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Search for a song"
          placeholder="Song or artist"
          loading={loading}
        />
      </div>

      {searching ? (
        <section className="analyze__list" aria-label="Search results">
          {degraded && (
            <div className="analyze__notice">
              <Notice>
                Search is offline right now. These are songs {APP.name} already
                knows.
              </Notice>
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="analyze__empty">Nothing found for “{query.trim()}”.</p>
          )}
          <ul className="analyze__rows">
            {results.map((song, index) => (
              <li
                key={song.id}
                className="u-rise"
                style={{ '--rise-delay': `${Math.min(index, 8) * 30}ms` } as CSSProperties}
              >
                <SongRow song={song} onSelect={startAnalysis} size={48} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        recents.length > 0 && (
          <section className="analyze__list analyze__recents" aria-label="Recent songs">
            <div className="analyze__listHead">
              <h2 className="analyze__listTitle">Recently read</h2>
              <Link to="/songs" className="analyze__all">
                All songs
              </Link>
            </div>
            <ul className="analyze__rows">
              {recents.map((song) => (
                <li key={song.id}>
                  <SongRow song={song} onSelect={startAnalysis} size={44} />
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
