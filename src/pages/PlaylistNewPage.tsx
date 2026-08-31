import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { KeywordInput } from '../components/playlist/KeywordInput';
import { SongPicker } from '../components/playlist/SongPicker';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { SongRow } from '../components/ui/SongRow';
import { createPlaylist, upsertSong } from '../db/repositories';
import { ensurePlaylistVectors } from '../features/playlists/ensureVectors';
import { moodStateFromPlaylist } from '../features/mood/moodVisualState';
import type { Playlist, Song } from '../types';
import './playlistEdit.css';

const SUGGESTIONS = [
  'dreamy',
  'nighttime',
  'euphoric',
  'heartbreak',
  'warm',
  'organic',
  'glossy',
  'weird',
];

export default function PlaylistNewPage() {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [examples, setExamples] = useState<Song[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // The environment previews the world being described as it is described.
  const preview = useMemo(
    () =>
      moodStateFromPlaylist({
        id: 'draft',
        name: name || 'draft',
        keywords,
        songIds: [],
        createdAt: 0,
        updatedAt: 0,
      } as Playlist),
    [name, keywords],
  );
  useMoodEnvironment(preview, { resolution: 0.62, quality: 0.8, transitionMs: 900 });

  const canSave = name.trim().length > 0 && keywords.length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      for (const song of examples) {
        await upsertSong(song);
      }
      const playlist = await createPlaylist({
        name: name.trim(),
        keywords,
        songIds: examples.map((song) => song.id),
      });
      // Vectors are computed now so the playlist is immediately matchable.
      await ensurePlaylistVectors(playlist).catch(() => undefined);
      navigate(`/playlists/${playlist.id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page pl-edit">
      <PageHeader back backTo="/playlists" eyebrow="New playlist" />

      <label className="pl-edit__nameLabel u-eyebrow" htmlFor="playlist-name">
        Name
      </label>
      <input
        id="playlist-name"
        className="pl-edit__name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="moonflower"
        autoComplete="off"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />

      <section className="pl-edit__section">
        <h2 className="u-section pl-edit__sectionTitle">Describe its world</h2>
        <p className="u-meta pl-edit__hint">
          Any words you like. Feelings, places, times of night.
        </p>
        <KeywordInput
          keywords={keywords}
          onChange={setKeywords}
          suggestions={SUGGESTIONS}
        />
      </section>

      <section className="pl-edit__section">
        <h2 className="u-section pl-edit__sectionTitle">Example songs</h2>
        <p className="u-meta pl-edit__hint">
          Optional. Songs you add shape the playlist more strongly than words.
        </p>

        {examples.length > 0 && (
          <ul className="pl-edit__examples">
            {examples.map((song) => (
              <li key={song.id}>
                <SongRow
                  song={song}
                  size={40}
                  aside={
                    <button
                      type="button"
                      className="pl-edit__remove"
                      onClick={() =>
                        setExamples((current) =>
                          current.filter((s) => s.id !== song.id),
                        )
                      }
                      aria-label={`Remove ${song.title}`}
                    >
                      ×
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <SongPicker
          onPick={(song) =>
            setExamples((current) =>
              current.some((s) => s.id === song.id) ? current : [...current, song],
            )
          }
          excludeIds={examples.map((song) => song.id)}
        />
      </section>

      <div className="pl-edit__cta">
        <Button variant="primary" block disabled={!canSave} onClick={save}>
          {saving ? 'Weaving…' : 'Create playlist'}
        </Button>
      </div>
    </div>
  );
}
