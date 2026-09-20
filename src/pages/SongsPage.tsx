import { useLiveQuery } from 'dexie-react-hooks';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { getAnalyzedSongs, getSongProfiles } from '../db/repositories';
import { AXES, isPlaced, type AxisValues } from '../features/song/axes';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import './song.css';

/**
 * Everything that has been read, as a way in to its breakdown.
 *
 * Each row carries eight dots, one per scale, lit in the scale's colour where
 * that scale has been placed. It is the smallest possible weave: enough to see
 * at a glance which songs have been thought about and which are still only the
 * machine's opinion.
 */
export default function SongsPage() {
  const navigate = useNavigate();
  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.45, quality: 0.45 });

  const rows = useLiveQuery(
    async () => {
      const songs = await getAnalyzedSongs();
      const profiles = await getSongProfiles(songs.map((song) => song.id));
      const byId = new Map(profiles.map((profile) => [profile.songId, profile]));
      return songs.map((song) => ({
        song,
        axes: (byId.get(song.id)?.axes ?? {}) as AxisValues,
        mood: byId.get(song.id)?.mood,
      }));
    },
    [],
    [],
  );

  return (
    <div className="page song songs">
      <header className="song__head">
        <button
          type="button"
          className="song__back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M12.5 4.5 7 10l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <h1 className="song__display songs__title">Read</h1>
      <p className="song__hint songs__count">
        {rows.length === 0
          ? 'Nothing analyzed yet.'
          : `${rows.length} song${rows.length === 1 ? '' : 's'}`}
      </p>

      {rows.length === 0 ? (
        <div className="songs__empty">
          <EmptyState title="No readings yet.">
            Analyze a song and its breakdown will wait for you here.
          </EmptyState>
          <Button variant="primary" onClick={() => navigate('/')}>
            Analyze a song
          </Button>
        </div>
      ) : (
        <ul className="songs__list">
          {rows.map(({ song, axes, mood }) => (
            <li key={song.id}>
              <Link
                className="srow"
                to={`/song/${encodeURIComponent(song.id)}`}
                aria-label={`Breakdown of ${song.title} by ${song.artist}`}
              >
                <Artwork src={song.artworkUrl} seed={song.id} size={44} alt="" />
                <span className="srow__text">
                  <span className="srow__title">{song.title}</span>
                  <span className="srow__meta">
                    {[song.artist, mood].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="srow__weave" aria-hidden="true">
                  {AXES.map((axis) => (
                    <span
                      key={axis.id}
                      className={`srow__dot${
                        isPlaced(axes, axis.id) ? ' srow__dot--on' : ''
                      }`}
                      style={{ '--axis': axis.color } as CSSProperties}
                    />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
