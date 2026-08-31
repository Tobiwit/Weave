import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { WeaveMark } from '../components/brand/WeaveMark';
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

  // The opening screen stays deliberately low-information: atmosphere, no mood.
  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.66, quality: 0.85 });

  const startAnalysis = async (song: Song) => {
    await upsertSong(song).catch(() => undefined);
    navigate(`/analysis/${encodeURIComponent(song.id)}`);
  };

  const searching = query.trim().length >= 2;

  return (
    <div className="page analyze">
      <header className="analyze__brand">
        <span className="brand">
          <WeaveMark size={26} idSuffix="head" />
          <span className="brand__name">{APP.name}</span>
        </span>
        {/* Settings is entered contextually; it is not a permanent tab. */}
        <Link to="/settings" className="analyze__settings" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M10 2.6v1.8M10 15.6v1.8M17.4 10h-1.8M4.4 10H2.6M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3M15.2 15.2l-1.3-1.3M6.1 6.1 4.8 4.8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </header>

      <h1 className="u-hero analyze__heading u-rise">{COPY.analyzeHeading}</h1>

      {!online && (
        <div className="analyze__offline">
          <Notice>
            You are offline. Everything already analyzed stays browsable; a new
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
                Search is offline right now. These are songs already known to{' '}
                {APP.name}.
              </Notice>
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="analyze__empty u-meta">
              Nothing found for “{query.trim()}”.
            </p>
          )}
          <ul>
            {results.map((song, index) => (
              <li
                key={song.id}
                className="u-rise"
                style={{ '--rise-delay': `${index * 35}ms` } as CSSProperties}
              >
                <SongRow song={song} onSelect={startAnalysis} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        recents.length > 0 && (
          <section className="analyze__list u-rise" aria-label="Recent songs">
            <p className="u-eyebrow analyze__eyebrow">Recently</p>
            <ul>
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
