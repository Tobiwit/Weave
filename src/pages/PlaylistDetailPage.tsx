import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { KeywordInput } from '../components/playlist/KeywordInput';
import { PlaylistMaterial } from '../components/playlist/PlaylistMaterial';
import { SongPicker } from '../components/playlist/SongPicker';
import { Button } from '../components/ui/Button';
import { Chip, ChipRow } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/Notice';
import { SongRow } from '../components/ui/SongRow';
import {
  deletePlaylist,
  getPlaylist,
  getSongProfiles,
  getSongs,
  removeSongFromPlaylist,
  savePlaylist,
  upsertSong,
} from '../db/repositories';
import { nearestPlaylists } from '../features/matching';
import { ensureLibraryVectors, ensurePlaylistVectors } from '../features/playlists/ensureVectors';
import { unreadSongIds } from '../features/playlists/importPlaylist';
import { toCandidate } from '../features/playlists/playlistEngine';
import {
  coreQualities,
  describeBreadth,
  rankDefiningSongs,
} from '../features/playlists/playlistInsights';
import { moodStateFromPlaylist, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import type { Playlist, Song, SongProfile } from '../types';
import './playlistDetail.css';

export default function PlaylistDetailPage() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [profiles, setProfiles] = useState<SongProfile[]>([]);
  const [others, setOthers] = useState<Playlist[]>([]);
  const [editing, setEditing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [unread, setUnread] = useState<string[]>([]);

  useEffect(() => {
    if (!playlistId) return;
    let cancelled = false;

    const load = async () => {
      const found = await getPlaylist(playlistId);
      if (cancelled) return;
      if (!found) {
        setMissing(true);
        return;
      }
      setPlaylist(found);
      const [loadedSongs, loadedProfiles] = await Promise.all([
        getSongs(found.songIds),
        getSongProfiles(found.songIds),
      ]);
      if (cancelled) return;
      setSongs(loadedSongs);
      setProfiles(loadedProfiles);

      // Vectors are prepared in the background so relationships can appear.
      const library = await ensureLibraryVectors().catch(() => [] as Playlist[]);
      if (cancelled) return;
      setOthers(library);
      const refreshed = library.find((p) => p.id === playlistId);
      if (refreshed) setPlaylist(refreshed);
      const refreshedProfiles = await getSongProfiles(found.songIds);
      if (!cancelled) setProfiles(refreshedProfiles);
      const pending = await unreadSongIds(found);
      if (!cancelled) setUnread(pending);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [playlistId, reloadToken]);

  const mood = useMemo(
    () => (playlist ? moodStateFromPlaylist(playlist) : NEUTRAL_MOOD),
    [playlist],
  );
  useMoodEnvironment(mood, { resolution: 0.7, quality: 0.8 });

  const qualities = useMemo(() => coreQualities(profiles), [profiles]);
  const breadth = useMemo(
    () => describeBreadth(profiles, playlist?.centroidEmbedding),
    [profiles, playlist?.centroidEmbedding],
  );
  const defining = useMemo(() => rankDefiningSongs(profiles), [profiles]);

  const relations = useMemo(() => {
    if (!playlist || others.length < 2) return [];
    const candidates = others.map(toCandidate).filter((c) => c.vector.length > 0);
    const self = candidates.find((c) => c.playlistId === playlist.id);
    if (!self) return [];
    return nearestPlaylists(self, candidates, 3);
  }, [playlist, others]);

  const songById = useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs],
  );
  const playlistById = useMemo(
    () => new Map(others.map((p) => [p.id, p])),
    [others],
  );

  if (missing) {
    return (
      <div className="page">
        <EmptyState title="That playlist is gone.">
          It may have been deleted from this device.
        </EmptyState>
        <Button variant="primary" onClick={() => navigate('/playlists')}>
          Back to playlists
        </Button>
      </div>
    );
  }

  if (!playlist) return <div className="page" aria-busy="true" />;

  const persist = async (patch: Partial<Playlist>) => {
    const next = { ...playlist, ...patch };
    setPlaylist(next);
    await savePlaylist(next);
    await ensurePlaylistVectors(next).catch(() => undefined);
    setReloadToken((token) => token + 1);
  };

  const addSong = async (song: Song) => {
    if (playlist.songIds.includes(song.id)) return;
    await upsertSong(song);
    await persist({ songIds: [...playlist.songIds, song.id] });
  };

  const dropSong = async (songId: string) => {
    await removeSongFromPlaylist(playlist.id, songId);
    setReloadToken((token) => token + 1);
  };

  const remove = async () => {
    await deletePlaylist(playlist.id);
    navigate('/playlists', { replace: true });
  };

  return (
    <div className="page pl-detail">
      <PageHeader
        back
        backTo="/playlists"
        action={
          <Button variant="quiet" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
        }
      />

      <div className="pl-detail__hero">
        <PlaylistMaterial playlist={playlist} size={84} radius="var(--r-lg)" />
        <div>
          <h1 className="u-title">{playlist.name}</h1>
          <p className="u-meta">
            {playlist.songIds.length}{' '}
            {playlist.songIds.length === 1 ? 'song' : 'songs'}
            {breadth ? ` · ${breadth.label}` : ''}
          </p>
        </div>
      </div>

      <section className="pl-detail__section">
        <h2 className="u-eyebrow">Its world</h2>
        {editing ? (
          <KeywordInput
            keywords={playlist.keywords}
            onChange={(keywords) => void persist({ keywords })}
          />
        ) : (
          <ChipRow>
            {playlist.keywords.map((keyword) => (
              <Chip key={keyword}>{keyword}</Chip>
            ))}
          </ChipRow>
        )}
      </section>

      {qualities.length > 0 && (
        <section className="pl-detail__section">
          <h2 className="u-eyebrow">Core qualities</h2>
          <p className="pl-detail__qualities">{qualities.join(' · ')}</p>
        </section>
      )}

      <section className="pl-detail__section">
        <h2 className="u-eyebrow">
          {defining.length > 1 ? 'Defining songs' : 'Songs'}
        </h2>
        {unread.length > 0 && (
          <p className="u-meta pl-detail__unread">
            {unread.length} {unread.length === 1 ? 'song has' : 'songs have'} not
            been read yet, so {unread.length === 1 ? 'it does' : 'they do'} not
            shape this playlist's centre. Open one to read it.
          </p>
        )}

        {songs.length === 0 ? (
          <p className="u-meta pl-detail__empty">
            No songs yet. This playlist is defined by its words alone.
          </p>
        ) : (
          <ul className="pl-detail__songs">
            {(defining.length > 0
              ? defining.map((entry) => ({
                  song: songById.get(entry.songId),
                  score: entry.score,
                }))
              : songs.map((song) => ({ song, score: undefined }))
            )
              .filter((row) => row.song)
              .map(({ song, score }) => (
                <li key={song!.id}>
                  <SongRow
                    song={song!}
                    size={44}
                    aside={
                      editing ? (
                        <button
                          type="button"
                          className="pl-detail__remove"
                          onClick={() => void dropSong(song!.id)}
                          aria-label={`Remove ${song!.title}`}
                        >
                          ×
                        </button>
                      ) : score !== undefined ? (
                        <span className="pl-detail__score">{score}</span>
                      ) : undefined
                    }
                  />
                </li>
              ))}
          </ul>
        )}

        {editing && (
          <div className="pl-detail__picker">
            <SongPicker onPick={addSong} excludeIds={playlist.songIds} />
          </div>
        )}
      </section>

      {relations.length > 0 && (
        <section className="pl-detail__section">
          <h2 className="u-eyebrow">Relationships</h2>
          <ul className="pl-detail__relations">
            {relations.map((relation) => {
              const other = playlistById.get(relation.playlistId);
              if (!other) return null;
              return (
                <li key={relation.playlistId}>
                  <Link
                    to={`/playlists/${relation.playlistId}`}
                    className="pl-detail__relation"
                  >
                    <span>
                      {playlist.name} ↔ {other.name}
                    </span>
                    <span className="pl-detail__relationScore">{relation.score}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editing && (
        <div className="pl-detail__danger">
          <Button variant="ghost" size="sm" onClick={remove}>
            Delete playlist
          </Button>
        </div>
      )}
    </div>
  );
}
