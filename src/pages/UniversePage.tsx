import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { OrbitWeave } from '../components/brand/OrbitWeave';
import { PlaylistMaterial } from '../components/playlist/PlaylistMaterial';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { AXIS_GROUPS, axisWord, type AxisGroupId } from '../features/song/axes';
import {
  loadPlaylistPositions,
  placeLabels,
  type PlaylistPosition,
} from '../features/universe/positions';
import './universe.css';

const STOPS = 15;
const LAST = STOPS - 1;
/** How far a label sits from its dot, as a share of the (square) field. */
const LABEL_GAP = 0.09;

/** A position snapped to the nearest stop, so a playlist sits on the lattice. */
const snap = (value: number) => Math.round(value * LAST) / LAST;

/**
 * Your playlists on the scales.
 *
 * The same dot field the axis pads use, read instead of written: each
 * playlist is one point at the middle of its songs, with a halo as wide as
 * the middle half of them, so a focused playlist is a tight point and a broad
 * one a wide cloud. The four groups are four views of the same library;
 * switching glides every point to its place on the next pair of scales.
 */
export default function UniversePage() {
  const [positions, setPositions] = useState<PlaylistPosition[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [groupId, setGroupId] = useState<AxisGroupId>('energy');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.7, quality: 0.9 });

  useEffect(() => {
    let cancelled = false;
    loadPlaylistPositions()
      .then((result) => !cancelled && setPositions(result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const group = AXIS_GROUPS.find((entry) => entry.id === groupId) ?? AXIS_GROUPS[0];
  const [x, y] = group.axes;

  const placed = useMemo(
    () => (positions ?? []).filter((entry) => entry.axes[x.id] && entry.axes[y.id]),
    [positions, x.id, y.id],
  );
  const unplaced = useMemo(
    () => (positions ?? []).filter((entry) => !(entry.axes[x.id] && entry.axes[y.id])),
    [positions, x.id, y.id],
  );

  // The field swells around every playlist, the way a pad swells around its
  // one value: the library's shape shows even before the points are read.
  const lattice = useMemo(() => {
    // A stop holding a playlist is drawn by that playlist's own dot.
    const taken = new Set(
      placed.map(
        (entry) =>
          `${Math.round(entry.axes[y.id]!.median * LAST)}-${Math.round(entry.axes[x.id]!.median * LAST)}`,
      ),
    );
    const cells: { key: string; px: number; py: number; swell: number }[] = [];
    for (let row = 0; row < STOPS; row += 1) {
      for (let col = 0; col < STOPS; col += 1) {
        const px = col / LAST;
        const py = row / LAST;
        let swell = 0;
        for (const entry of placed) {
          const ax = entry.axes[x.id];
          const ay = entry.axes[y.id];
          if (!ax || !ay) continue;
          const reach = 0.06 + Math.max(ax.high - ax.low, ay.high - ay.low) * 0.25;
          const distance = Math.hypot(px - ax.median, py - ay.median);
          swell = Math.max(swell, Math.exp(-0.5 * (distance / reach) ** 2));
        }
        if (!taken.has(`${row}-${col}`)) cells.push({ key: `${row}-${col}`, px, py, swell });
      }
    }
    return cells;
  }, [placed, x.id, y.id]);

  const labels = useMemo(
    () =>
      placeLabels(
        placed.map((entry) => ({
          id: entry.playlist.id,
          x: snap(entry.axes[x.id]!.median),
          y: snap(entry.axes[y.id]!.median),
          name: entry.playlist.name,
        })),
        { gap: LABEL_GAP },
      ),
    [placed, x.id, y.id],
  );

  const selected = (positions ?? []).find((entry) => entry.playlist.id === selectedId);

  if (failed) {
    return (
      <div className="page universe">
        <EmptyState title="The universe could not be drawn.">
          Try again in a moment.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page universe">
      <header className="universe__head">
        <h1 className="universe__title">Your universe</h1>
        <p className="universe__sub">Where each playlist sits, four ways.</p>
      </header>

      <div className="universe__switch" role="tablist" aria-label="Scales">
        {AXIS_GROUPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === groupId}
            className={`universe__tab${entry.id === groupId ? ' universe__tab--on' : ''}`}
            onClick={() => setGroupId(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {positions === null ? (
        <div className="universe__loading">
          <OrbitWeave size={72} mode="working" />
        </div>
      ) : positions.length === 0 ? (
        <EmptyState title="No playlists yet.">
          Make one and it will take its place here.
        </EmptyState>
      ) : (
        <>
          <div
            className="universe__map"
            style={{ '--ax': x.color, '--ay': y.color } as CSSProperties}
          >
            <span className="universe__pole universe__pole--yhigh">{y.high}</span>
            <span className="universe__pole universe__pole--ylow">{y.low}</span>

            <div
              className="universe__field"
              role="group"
              aria-label={`${x.label} across, ${y.label} up`}
              onClick={() => setSelectedId(null)}
            >
              <div className="universe__lattice" aria-hidden="true">
                {lattice.map((cell) => (
                  <span
                    key={cell.key}
                    className="universe__dot"
                    style={
                      {
                        left: `${cell.px * 100}%`,
                        bottom: `${cell.py * 100}%`,
                        '--dot-scale': (0.5 + cell.swell * 1.4).toFixed(3),
                        '--dot-opacity': (0.14 + cell.swell * 0.5).toFixed(3),
                      } as CSSProperties
                    }
                  />
                ))}
              </div>

              <div className="universe__points">
                {placed.map((entry) => {
                  const ax = entry.axes[x.id]!;
                  const ay = entry.axes[y.id]!;
                  const on = entry.playlist.id === selectedId;
                  const label = labels[entry.playlist.id] ?? { flip: false, dy: 0 };
                  // The leader runs from the dot to the near edge of the
                  // label. The field is square, so one unit serves both axes.
                  const run = label.flip ? -LABEL_GAP : LABEL_GAP;
                  const length = Math.hypot(run, label.dy);
                  const angle = (Math.atan2(-label.dy, run) * 180) / Math.PI;
                  return (
                    <button
                      key={entry.playlist.id}
                      type="button"
                      className={`universe__point${on ? ' universe__point--on' : ''}${
                        label.flip ? ' universe__point--flip' : ''
                      }${selectedId && !on ? ' universe__point--dim' : ''}`}
                      style={
                        {
                          left: `${snap(ax.median) * 100}%`,
                          bottom: `${snap(ay.median) * 100}%`,
                          '--gap': LABEL_GAP,
                          '--label-dy': label.dy.toFixed(3),
                          '--leader-len': length.toFixed(4),
                          '--leader-angle': `${angle.toFixed(2)}deg`,
                        } as CSSProperties
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(on ? null : entry.playlist.id);
                      }}
                      aria-pressed={on}
                      aria-label={`${entry.playlist.name}: ${axisWord(x, ax.median)}, ${axisWord(y, ay.median)}`}
                    >
                      <span className="universe__leader" aria-hidden="true" />
                      <span className="universe__core" aria-hidden="true" />
                      <span className="universe__label">{entry.playlist.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="universe__xpoles">
              <span>{x.low}</span>
              <span>{x.high}</span>
            </div>
          </div>

          {selected && selected.axes[x.id] && selected.axes[y.id] ? (
            <div className="universe__card u-rise" key={selected.playlist.id}>
              <PlaylistMaterial playlist={selected.playlist} size={56} />
              <div className="universe__cardText">
                <p className="universe__cardName">{selected.playlist.name}</p>
                <p className="universe__cardWords">
                  <span style={{ color: x.color }}>{axisWord(x, selected.axes[x.id]!.median)}</span>
                  <span className="universe__cardSep"> · </span>
                  <span style={{ color: y.color }}>{axisWord(y, selected.axes[y.id]!.median)}</span>
                </p>
                <p className="universe__cardMeta">
                  {selected.axes[x.id]!.songs > 0
                    ? `Placed from ${selected.axes[x.id]!.songs} read ${
                        selected.axes[x.id]!.songs === 1 ? 'song' : 'songs'
                      }`
                    : 'Placed from its words alone'}
                </p>
              </div>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => navigate(`/playlists/${selected.playlist.id}`)}
              >
                Open
              </Button>
            </div>
          ) : (
            <p className="universe__hint">
              Tap a point to see which playlist it is. A wide halo means its
              songs are spread out on these scales.
            </p>
          )}

          {unplaced.length > 0 && (
            <p className="universe__unplaced">
              Not placed yet, with nothing read on these scales:{' '}
              {unplaced.map((entry) => entry.playlist.name).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
