import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { AxisGroupPanel } from '../components/song/AxisGroupPanel';
import type { AxisPatch } from '../components/song/AxisPad';
import { Fold } from '../components/song/Fold';
import { AxisReadout } from '../components/dev/AxisReadout';
import { TraceList } from '../components/dev/TraceList';
import { SongSignals } from '../components/song/SongSignals';
import { WeaveChart } from '../components/song/WeaveChart';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { setSongAxes } from '../db/repositories';
import {
  AXES_BY_ID,
  AXIS_GROUPS,
  placedCount,
  type AxisGroupId,
  type AxisId,
  type AxisValues,
} from '../features/song/axes';
import { moodStateFromProfile, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { machineSuggestions, readAxes } from '../features/song/axisReading';
import { useRuntimeSettings } from '../hooks/useRuntimeSettings';
import { useSongProfile } from '../hooks/useSongProfile';
import { Fingerprint } from './result/Fingerprint';
// The fingerprint editor is the existing, canonical way to change what the
// analysis decided. It is reused whole rather than rebuilt, which is why its
// stylesheet is pulled in here alongside this screen's own.
import './result.css';
import './song.css';

/**
 * The breakdown of one song.
 *
 * Two readings of the same song sit on this page and they are kept apart on
 * purpose. The Weave is yours: eight scales, placed by hand, drawn as the thing
 * that dominates the screen. Everything below it is the machine's: the words it
 * chose, the numbers it was given, and who told it. Both can be changed here;
 * neither is allowed to write into the other.
 */
export default function SongPage() {
  const { songId } = useParams<{ songId: string }>();
  const decodedId = songId ? decodeURIComponent(songId) : undefined;
  const { profile, song, update, loading } = useSongProfile(decodedId);
  const navigate = useNavigate();
  const { devTrace } = useRuntimeSettings();
  const machineAxes = useMemo(() => (profile ? readAxes(profile) : null), [profile]);
  const suggestions = useMemo(() => (profile ? machineSuggestions(profile) : {}), [profile]);

  const [reading, setReading] = useState<AxisId | null>(null);
  const [openGroup, setOpenGroup] = useState<AxisGroupId | null>(null);
  const [showValues, setShowValues] = useState(false);

  const mood = useMemo(
    () => (profile ? moodStateFromProfile(profile) : NEUTRAL_MOOD),
    [profile],
  );
  // The chart is the event on this screen, so the field behind it stays low.
  useMoodEnvironment(mood, { resolution: 0.5, quality: 0.5, transitionMs: 1400 });

  const values: AxisValues = profile?.axes ?? {};
  const placed = placedCount(values);

  /*
   * Written through the store rather than through the profile held in this
   * render: a field places both of its scales at once, and two writes built
   * from the same stale `axes` would have the second undo the first.
   */
  const setAxes = (patch: AxisPatch) => {
    if (decodedId) setSongAxes(decodedId, patch);
  };

  /** Reading a strand also opens the group it lives in, so it can be moved. */
  const readStrand = (id: AxisId | null) => {
    setReading(id);
    if (id) setOpenGroup(AXES_BY_ID[id].group);
  };

  if (loading) {
    return <div className="page song" aria-busy="true" />;
  }

  if (!profile || !song) {
    return (
      <div className="page song">
        <EmptyState title="Nothing to break down yet.">
          This song has not been analyzed, or its reading has been cleared.
        </EmptyState>
        <Button variant="primary" onClick={() => navigate('/')}>
          Back to Analyze
        </Button>
      </div>
    );
  }

  return (
    <div className="page song">
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
        <Artwork src={song.artworkUrl} seed={song.id} size={40} alt="" />
        <div className="song__identity">
          <p className="song__title">{song.title}</p>
          <p className="song__artist">{song.artist}</p>
        </div>
      </header>

      <div className="song__weave">
        <div className="song__weaveHead">
          <h1 className="song__display">The Weave</h1>
          <button
            type="button"
            className="song__values"
            onClick={() => setShowValues(!showValues)}
            aria-pressed={showValues}
          >
            {showValues ? 'hide values' : 'values'}
          </button>
        </div>

        <WeaveChart
          values={values}
          suggestions={suggestions}
          selected={reading}
          onSelect={readStrand}
          showValues={showValues}
        />

        <p className="song__hint">
          {placed === 0
            ? 'Drawn from the reading. Open a group below to place a scale yourself.'
            : reading
              ? 'Tap the strand again to let it go.'
              : `${placed} of 8 placed · tap a strand to read it`}
        </p>
      </div>

      <div className="song__groups">
        {AXIS_GROUPS.map((group) => (
          <AxisGroupPanel
            key={group.id}
            group={group}
            values={values}
            open={openGroup === group.id}
            onToggle={() => setOpenGroup(openGroup === group.id ? null : group.id)}
            onChange={setAxes}
            highlighted={reading}
            onHighlight={setReading}
            showValues={showValues}
            suggestions={suggestions}
          />
        ))}
      </div>

      <div className="song__folds">
        <Fold name="The reading" note={profile.mood ?? 'unnamed'}>
          <Fingerprint profile={profile} onChange={update} />
        </Fold>

        <SongSignals profile={profile} showValues={showValues} />

        {devTrace && machineAxes && (
          <Fold name="Machine axes" note="dev">
            <AxisReadout readings={machineAxes} />
          </Fold>
        )}
        {devTrace && (
          <Fold name="Trace" note={`${profile.trace?.length ?? 0} steps`}>
            <TraceList entries={profile.trace ?? []} />
          </Fold>
        )}
      </div>

      <div className="song__foot">
        <Button variant="quiet" onClick={() => navigate(`/result/${encodeURIComponent(song.id)}`)}>
          Find its place
        </Button>
      </div>
    </div>
  );
}
