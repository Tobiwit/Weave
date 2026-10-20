import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ReadingProgress } from '../components/analysis/ReadingProgress';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { KeywordInput } from '../components/playlist/KeywordInput';
import { PlaylistMaterial } from '../components/playlist/PlaylistMaterial';
import { SongPicker } from '../components/playlist/SongPicker';
import { Button } from '../components/ui/Button';
import { Chip, ChipRow } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/Notice';
import { Ring } from '../components/ui/Ring';
import { SongRow } from '../components/ui/SongRow';
import {
  deletePlaylist,
  getPlaylist,
  getSongProfiles,
  getAllSongProfiles,
  getSongs,
  removeSongFromPlaylist,
  savePlaylist,
  upsertSong,
} from '../db/repositories';
import { buildLibraryCorpus, type TagCorpus } from '../features/matching';
import {
  ensureLibraryVectors,
  ensurePlaylistVectors,
  rebuildPlaylistRepresentation,
} from '../features/playlists/ensureVectors';
import { unreadSongIds } from '../features/playlists/importPlaylist';
import { relatedPlaylists, type PlaylistRelationScore } from '../features/playlists/relations';
import {
  coreQualities,
  describeBreadth,
  rankDefiningSongs,
} from '../features/playlists/playlistInsights';
import { moodStateFromPlaylist, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import type { RebuildReport } from '../features/playlists/ensureVectors';
import type { Playlist, Song, SongProfile } from '../types';
import { SongSheet } from './playlists/SongSheet';
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
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuilt, setRebuilt] = useState<RebuildReport | null>(null);
  const [corpus, setCorpus] = useState<TagCorpus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [selected, setSelected] = useState<Song | null>(null);

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
      // Core qualities are judged against the whole library, so a word common
      // to every playlist stops counting as this one's defining quality.
      const allProfiles = await getAllSongProfiles().catch(() => [] as SongProfile[]);
      if (!cancelled) setCorpus(buildLibraryCorpus(allProfiles, library));
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

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const mood = useMemo(
    () => (playlist ? moodStateFromPlaylist(playlist) : NEUTRAL_MOOD),
    [playlist],
  );
  useMoodEnvironment(mood, { resolution: 0.7, quality: 0.8 });

  const qualities = useMemo(
    () => coreQualities(profiles, corpus ?? undefined),
    [profiles, corpus],
  );
  const breadth = useMemo(
    () => describeBreadth(profiles, playlist?.centroidEmbedding),
    [profiles, playlist?.centroidEmbedding],
  );
  const defining = useMemo(() => rankDefiningSongs(profiles), [profiles]);

  // Measured song by song with the real matcher, once the library's vectors
  // are ready. Comparing whole-playlist vectors scored every pair at 100.
  const [relations, setRelations] = useState<PlaylistRelationScore[]>([]);
  useEffect(() => {
    if (!playlist || others.length < 2) return;
    let cancelled = false;
    void relatedPlaylists(playlist, others)
      .then((next) => {
        if (!cancelled) setRelations(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
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
    // Deleting is not undoable from here, and the button sits one tap from
    // "Done". Asking once is cheap; losing a playlist you spent an evening
    // describing is not.
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
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
        <PlaylistMaterial playlist={playlist} size={112} radius="var(--r-lg)" />
        <div className="pl-detail__heroText">
          <h1 className="pl-detail__name">{playlist.name}</h1>
          <p className="pl-detail__meta">
            {playlist.songIds.length}{' '}
            {playlist.songIds.length === 1 ? 'song' : 'songs'}
            {breadth ? ` · ${breadth.label}` : ''}
          </p>
        </div>
      </div>

      <div className="pl-detail__tools">
        <Button
          variant="quiet"
          size="sm"
          disabled={rebuilding}
          onClick={() => {
            setRebuilding(true);
            setRebuilt(null);
            void rebuildPlaylistRepresentation(playlist)
              .then((report) => setRebuilt(report))
              .catch(() => undefined)
              .finally(() => {
                setRebuilding(false);
                reload();
              });
          }}
        >
          {rebuilding ? 'Reevaluating…' : 'Reevaluate'}
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={() => navigate(`/playlists/${playlist.id}/representation`)}
        >
          Representation
        </Button>
      </div>

      {rebuilt && <RebuildNote report={rebuilt} />}

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
        <ReadingProgress unreadIds={unread} onFinished={reload} />

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
                    actionLabel="Open"
                    onSelect={editing ? undefined : setSelected}
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
                        <Ring
                          value={score}
                          size={40}
                          thickness={2.5}
                          unit=""
                          fontScale={0.38}
                          ariaLabel={`${score} percent representative`}
                        />
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
          <h2 className="u-eyebrow">Close to</h2>
          <p className="u-meta pl-detail__relationsNote">
            How well its songs would fit in each, on average.
          </p>
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
                    <PlaylistMaterial playlist={other} size={36} />
                    <span className="pl-detail__relationName">{other.name}</span>
                    <Ring
                      value={relation.score}
                      size={44}
                      thickness={2.5}
                      unit=""
                      fontScale={0.38}
                      ariaLabel={`${relation.score} percent`}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SongSheet
        playlist={playlist}
        song={selected}
        onClose={() => setSelected(null)}
        onRemove={(songId) => void dropSong(songId)}
      />

      {editing && (
        <div className="pl-detail__danger">
          <Button
            variant="ghost"
            size="sm"
            className={confirmingDelete ? 'pl-detail__confirm' : undefined}
            onClick={remove}
          >
            {confirmingDelete ? 'Really delete it?' : 'Delete playlist'}
          </Button>
          {confirmingDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What a rebuild actually did.
 *
 * Rebuilding is usually instant and usually changes nothing, which from the
 * outside is indistinguishable from a button that does not work. Saying so
 * plainly is the difference between the two.
 */
function RebuildNote({ report }: { report: RebuildReport }) {
  const moved = Math.round(report.centroidShift * 1000) / 1000;

  const summary =
    report.songs === 0
      ? 'Nothing to rebuild yet: none of these songs have been read.'
      : report.changed === 0
        ? `Rebuilt ${report.songs} ${report.songs === 1 ? 'song' : 'songs'}. Nothing changed, so this playlist already meant what it means now.`
        : `Rebuilt ${report.songs} ${report.songs === 1 ? 'song' : 'songs'}. ${report.changed} came out different and its centre moved by ${moved}.`;

  return (
    <p className="pl-detail__rebuilt u-meta" role="status">
      {summary}
      {report.unread > 0 &&
        ` ${report.unread} still unread, so ${report.unread === 1 ? 'it adds' : 'they add'} nothing yet.`}
    </p>
  );
}
