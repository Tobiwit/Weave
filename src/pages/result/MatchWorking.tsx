import '../../components/dev/dev.css';
import type { Playlist, PlaylistMatch } from '../../types';

const LABELS: Record<string, string> = {
  axes: 'axes',
  playlistSongs: 'songs',
  style: 'style',
  moodVibe: 'mood',
  tags: 'tags',
  themes: 'themes',
};

const fixed = (value: number | null | undefined, places = 2) =>
  typeof value === 'number' ? value.toFixed(places) : '–';

/**
 * The full working of one match: every component's raw similarity, its
 * calibrated score, the weight it started with, this playlist's learned
 * factor, the song's reliability and the share it finally carried. Then, for
 * the axes, where the song sat against each band. Development aid.
 */
export function MatchWorking({ match, playlist }: { match: PlaylistMatch; playlist: Playlist }) {
  const components = match.components ?? [];
  const axes = components.find((c) => c.name === 'axes')?.axes ?? [];

  return (
    <div className="match__working">
      <table className="working">
        <thead>
          <tr>
            <th>part</th>
            <th title="raw similarity">raw</th>
            <th title="calibrated 0-100">score</th>
            <th title="configured weight">base</th>
            <th title="this playlist's learned factor">×pl</th>
            <th title="song evidence reliability">×rel</th>
            <th title="share of the final score">share</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.name} className={c.similarity === null ? 'working__off' : undefined}>
              <th scope="row">{LABELS[c.name] ?? c.name}</th>
              <td>{fixed(c.similarity, 3)}</td>
              <td>{c.score ?? '–'}</td>
              <td>{fixed(c.baseWeight)}</td>
              <td>{fixed(c.factor)}</td>
              <td>{fixed(c.reliability)}</td>
              <td>{c.similarity === null ? '–' : `${Math.round(c.weight * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="working__note">
        final = Σ score × share = {match.score}
        {playlist.weighting
          ? ` · factors learned from ${playlist.weighting.members} songs`
          : ' · no factors learned yet (recalculate the library)'}
      </p>

      {axes.length > 0 && (
        <table className="working">
          <thead>
            <tr>
              <th>axis</th>
              <th title="song position, source and confidence">song</th>
              <th title="the playlist's band">band</th>
              <th title="importance to this playlist">imp</th>
              <th>score</th>
            </tr>
          </thead>
          <tbody>
            {axes.map((a) => (
              <tr key={a.axis}>
                <th scope="row">{a.axis}</th>
                <td>
                  {fixed(a.song)} <span className="working__dim">{a.songSource} c{fixed(a.songConfidence)}</span>
                </td>
                <td>
                  {fixed(Math.max(0, a.low))}–{fixed(Math.min(1, a.high))}{' '}
                  <span className="working__dim">m{fixed(a.median)}</span>
                </td>
                <td>{Math.round(a.importance * 100)}%</td>
                <td>{fixed(a.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
