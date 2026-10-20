import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { getAllPlaylists } from '../db/repositories';
import { moodStateFromPlaylist, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import {
  buildPlaylistRepresentation,
  type PlaylistRepresentation,
} from '../features/playlists/representation';
import { useRuntimeSettings } from '../hooks/useRuntimeSettings';
import { PlaylistMap } from './representation/PlaylistMap';
import './representation.css';

/**
 * What the matcher actually holds about a playlist.
 *
 * A score that cannot be taken apart is a score you have to take on faith. The
 * matching path is five separately calibrated measurements blended together,
 * so this reads those structures back out: what each component is built from,
 * which words carry weight, how the songs sit relative to each other, and how
 * every song scores against the playlist it belongs to.
 */
export default function PlaylistRepresentationPage() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PlaylistRepresentation | null>(null);
  const [missing, setMissing] = useState(false);
  const { devTrace } = useRuntimeSettings();

  useEffect(() => {
    if (!playlistId) return;
    let cancelled = false;

    void (async () => {
      const playlists = await getAllPlaylists();
      const playlist = playlists.find((entry) => entry.id === playlistId);
      if (cancelled) return;
      if (!playlist) {
        setMissing(true);
        return;
      }
      const built = await buildPlaylistRepresentation(playlist, playlists);
      if (!cancelled) setData(built);
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const mood = useMemo(
    () => (data ? moodStateFromPlaylist(data.playlist) : NEUTRAL_MOOD),
    [data],
  );
  useMoodEnvironment(mood, { resolution: 0.45, quality: 0.5 });

  if (missing) {
    return (
      <div className="page">
        <EmptyState title="That playlist is gone." />
        <Button variant="primary" onClick={() => navigate('/playlists')}>
          Back to playlists
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page" aria-busy="true">
        <PageHeader back backTo={`/playlists/${playlistId}`} eyebrow="Representation" />
        <p className="u-meta">Reading what this playlist is made of…</p>
      </div>
    );
  }

  const unread = data.size - data.read;

  return (
    <div className="page rep">
      <PageHeader
        back
        backTo={`/playlists/${data.playlist.id}`}
        eyebrow="Representation"
        title={data.playlist.name}
      />

      <p className="u-meta rep__lede">
        Everything below is read straight out of the matcher. These are the same
        numbers that decide where a song lands.
      </p>

      <dl className="rep__facts">
        <div>
          <dt className="u-eyebrow">Songs read</dt>
          <dd>
            {data.read} of {data.size}
            {unread > 0 && <span className="rep__warn"> · {unread} unread</span>}
          </dd>
        </div>
        <div>
          <dt className="u-eyebrow">Breadth</dt>
          <dd>{data.breadth?.label ?? 'Not enough songs'}</dd>
        </div>
        <div>
          <dt className="u-eyebrow">Recipe</dt>
          <dd>
            v{data.embeddingVersion}
            {data.vectorVersion ? ` · vectors v${data.vectorVersion}` : ''}
          </dd>
        </div>
      </dl>

      {data.map.length > 0 && (
        <section className="rep__section">
          <h2 className="u-eyebrow">How its songs sit</h2>
          <PlaylistMap points={data.map} fallback={data.mapIsFallback} />
          {data.cohesion && (
            <p className="rep__cohesion">
              <span className="rep__cohesionLabel">{data.cohesion.label}</span>
              <span className="u-meta">{data.cohesion.description}</span>
            </p>
          )}
        </section>
      )}

      {data.feel.length > 0 && (
        <section className="rep__section">
          <h2 className="u-eyebrow">How it feels</h2>
          <p className="u-meta rep__note">
            Where its songs sit on the eight scales: the middle half of them,
            and the median. The tighter a band is compared with your whole
            library, the more that scale decides a match here.
          </p>
          <ul className="rep__feel">
            {data.feel.map((row) => (
              <li key={row.axis} className="rep__feelRow">
                <span className="rep__feelName">{row.label}</span>
                <span className="rep__feelPoles u-meta">
                  {row.low}
                  <span className="rep__feelTrack" aria-hidden="true">
                    <span
                      className="rep__feelBand"
                      style={{ left: `${row.from * 100}%`, width: `${(row.to - row.from) * 100}%` }}
                    />
                    <span className="rep__feelMedian" style={{ left: `${row.median * 100}%` }} />
                    {typeof row.stated === 'number' && (
                      <span className="rep__feelStated" style={{ left: `${row.stated * 100}%` }} />
                    )}
                  </span>
                  {row.high}
                </span>
                <span className="rep__feelMeta u-meta">{Math.round(row.importance * 100)}%</span>
                {devTrace && (
                  <span className="rep__dev rep__feelDev">
                    median {row.median.toFixed(2)} · band {row.from.toFixed(2)}–{row.to.toFixed(2)} ·{' '}
                    {row.members} songs (
                    {Object.entries(row.origins)
                      .map(([origin, count]) => `${count} ${origin}`)
                      .join(', ') || 'none'}
                    )
                    {typeof row.stated === 'number' ? ` · keywords point at ${row.stated.toFixed(2)}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {devTrace && data.keywordReading.length > 0 && (
            <p className="rep__dev">
              keywords → descriptor → facet ("?" = no clear facet, sent to mood):{' '}
              {data.keywordReading
                .map(
                  (entry) =>
                    `${entry.keyword} → ${entry.descriptor ?? 'nothing'} (${entry.similarity.toFixed(2)}) → ${entry.facet}${entry.assigned ? '' : '?'}`,
                )
                .join(' · ')}
            </p>
          )}
          {devTrace && (
            <p className="rep__dev">
              {data.weightingMeasuredAt
                ? `weights learned ${new Date(data.weightingMeasuredAt).toLocaleString()}`
                : 'no per-playlist weights learned yet; recalculate the library to learn them'}
            </p>
          )}
        </section>
      )}

      <section className="rep__section">
        <h2 className="u-eyebrow">What this playlist says it is</h2>
        <p className="u-meta rep__note">
          Each part of a match asks a different question. This is the answer
          this playlist gives to each of them.
        </p>
        <ul className="rep__components">
          {data.components.map((component) => (
            <li
              key={component.name}
              className={`rep__component${component.available ? '' : ' rep__component--off'}`}
            >
              <p className="u-eyebrow rep__componentName">{component.label}</p>
              <p className="rep__componentReads">
                {component.available
                  ? component.reads
                  : 'Nothing to compare yet, so this is left out of a match and the other parts take its share.'}
              </p>
              <p className="u-meta rep__componentInfluence">{component.influence}</p>
              {devTrace && (
                <p className="rep__dev">
                  base {component.weight.toFixed(2)} × factor {component.factor.toFixed(2)}
                  {typeof component.lift === 'number'
                    ? ` · members ${component.lift >= 0 ? '+' : ''}${component.lift} pts vs library`
                    : ' · not measured'}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {data.vocabulary.length > 0 && (
        <section className="rep__section">
          <h2 className="u-eyebrow">Its vocabulary</h2>
          <p className="u-meta rep__note">
            Community tags, weighted by how rare each is across every song you
            have read and by how much of this playlist carries it. Common words
            count for little; distinctive ones carry the comparison.
          </p>
          <ul className="rep__vocab">
            {data.vocabulary.map((entry) => (
              <li key={entry.tag} className="rep__vocabRow">
                <span className="rep__vocabTag">{entry.tag}</span>
                <span className="rep__vocabBar" aria-hidden="true">
                  <span
                    style={{
                      transform: `scaleX(${Math.min(1, entry.weight / (data.vocabulary[0]?.weight || 1))})`,
                    }}
                  />
                </span>
                <span className="rep__vocabMeta u-meta">
                  {entry.count}× · {entry.rarity.toFixed(1)}
                  {devTrace && ` · ${entry.category}${entry.categoryWeight < 1 ? ` ×${entry.categoryWeight}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.members.length > 0 && (
        <section className="rep__section">
          <h2 className="u-eyebrow">How its own songs score</h2>
          <p className="u-meta rep__note">
            Each song scored against this playlist with itself taken out, so
            nothing is measured partly against its own contribution.
          </p>
          <ScoreTable rows={data.members} />
          {data.saturation && !data.saturation.healthy && (
            <p className="rep__saturation" role="status">
              <span className="rep__saturationHead">
                {data.saturation.atCeiling} of {data.saturation.total} readings
                are pinned at the top of the scale
              </span>
              <span className="u-meta">{data.saturation.note}</span>
            </p>
          )}
        </section>
      )}

      {data.drawnIn.length > 0 && (
        <section className="rep__section">
          <h2 className="u-eyebrow">What it pulls on</h2>
          <p className="u-meta rep__note">
            The songs elsewhere in your library that score highest against this
            playlist.
          </p>
          <ScoreTable rows={data.drawnIn} />
        </section>
      )}
    </div>
  );
}

function ScoreTable({
  rows,
}: {
  rows: PlaylistRepresentation['members'];
}) {
  const cell = (value: number | null) =>
    value === null ? <span className="rep__na">–</span> : value;

  return (
    <div className="rep__tableWrap">
      <table className="rep__table">
        <colgroup>
          <col className="rep__colSong" />
          <col className="rep__colScore" />
          <col className="rep__colScore" />
          <col className="rep__colScore" />
          <col className="rep__colScore" />
          <col className="rep__colScore" />
          <col className="rep__colScore" />
          <col className="rep__colScore" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Song</th>
            <th scope="col" title="Feel: the eight scales">
              Feel
            </th>
            <th scope="col" title="Style: artist, genres, era">
              Sty
            </th>
            <th scope="col" title="Mood and character">
              Mood
            </th>
            <th scope="col" title="Themes">
              Thm
            </th>
            <th scope="col" title="Community tag vocabulary">
              Tag
            </th>
            <th scope="col" title="Similarity to the playlist's songs">
              Songs
            </th>
            <th scope="col">Final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.songId}>
              <th scope="row">
                <span className="rep__songTitle">{row.title}</span>
                <span className="rep__songArtist u-meta">{row.artist}</span>
              </th>
              <td>{cell(row.axes)}</td>
              <td>{cell(row.style)}</td>
              <td>{cell(row.moodVibe)}</td>
              <td>{cell(row.themes)}</td>
              <td>{cell(row.tags)}</td>
              <td>{cell(row.playlistSongs)}</td>
              <td className="rep__final">{row.final}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
