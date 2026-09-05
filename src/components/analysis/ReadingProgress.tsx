import { useEffect, useMemo, useRef, useState } from 'react';
import {
  enqueueReading,
  resumeReading,
  stopReading,
} from '../../features/analysis/readingQueue';
import { useReadingQueue } from '../../hooks/useReadingQueue';
import { Button } from '../ui/Button';
import './reading.css';

/**
 * Roughly how long one song takes end to end. The MusicBrainz limiter sets the
 * floor at a second; the rest is the other three lookups and the embedding.
 * Measured on a mid-range phone, so a rounded estimate is honest enough to
 * show and never wildly optimistic.
 */
const SECONDS_PER_SONG = 2.6;

function estimateReading(count: number): string {
  const seconds = Math.round(count * SECONDS_PER_SONG);
  if (seconds < 90) return 'under a minute';
  return `about ${Math.max(2, Math.round(seconds / 60))} minutes`;
}

interface Props {
  /** Songs in this playlist with no reading yet, as of the last load. */
  unreadIds: string[];
  /** Called once this playlist's songs have all been read. */
  onFinished: () => void;
}

/**
 * Offers to read a playlist's unread songs, and shows it happening.
 *
 * Scoped to this playlist rather than to the queue as a whole, so a batch
 * started somewhere else does not report its progress here. The shell carries
 * the global view.
 */
export function ReadingProgress({ unreadIds, onFinished }: Props) {
  const queue = useReadingQueue();
  const [starting, setStarting] = useState(false);
  const wasReading = useRef(false);

  const mine = useMemo(() => new Set(unreadIds), [unreadIds]);

  const remaining = useMemo(() => {
    let count = queue.pending.reduce((sum, id) => sum + (mine.has(id) ? 1 : 0), 0);
    if (queue.current && mine.has(queue.current.songId)) count += 1;
    return count;
  }, [queue, mine]);

  const reading = remaining > 0;
  const total = unreadIds.length;
  const read = Math.max(0, total - remaining);

  // The page's own data is stale the moment the last of its songs is read.
  useEffect(() => {
    if (reading) wasReading.current = true;
    else if (wasReading.current) {
      wasReading.current = false;
      onFinished();
    }
  }, [reading, onFinished]);

  if (total === 0) return null;

  if (!reading) {
    return (
      <div className="reading reading--offer">
        <p className="u-meta reading__text">
          {total} {total === 1 ? 'song has' : 'songs have'} not been read yet, so{' '}
          {total === 1 ? 'it does' : 'they do'} not shape this playlist&rsquo;s
          centre. Reading {total === 1 ? 'it' : 'them all'} takes{' '}
          {estimateReading(total)}, and carries on in the background.
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={starting}
          onClick={() => {
            setStarting(true);
            void enqueueReading(unreadIds).finally(() => setStarting(false));
          }}
        >
          {total === 1 ? 'Read it' : `Read all ${total}`}
        </Button>
      </div>
    );
  }

  const label = queue.waitingForNetwork
    ? 'Waiting for a connection'
    : queue.paused
      ? 'Stopped — the lookups keep failing'
      : queue.current && mine.has(queue.current.songId)
        ? `${queue.current.title} — ${queue.current.artist}`
        : 'Reading…';

  return (
    <div className="reading reading--active">
      <div
        className="reading__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={read}
        aria-label="Reading songs"
      >
        <span
          className="reading__fill"
          style={{ transform: `scaleX(${total > 0 ? read / total : 0})` }}
        />
      </div>
      <div className="reading__row">
        <p className="reading__now" title={label}>
          {label}
        </p>
        <p className="reading__count u-meta">
          {read} / {total}
        </p>
      </div>
      <div className="reading__actions">
        {queue.paused && (
          <Button variant="quiet" size="sm" onClick={resumeReading}>
            Try again
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => void stopReading()}>
          Stop
        </Button>
      </div>
    </div>
  );
}
