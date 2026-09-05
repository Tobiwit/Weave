import { useEffect } from 'react';
import { resumeReading, stopReading } from '../../features/analysis/readingQueue';
import { useReadingQueue } from '../../hooks/useReadingQueue';
import './reading.css';

/**
 * The shell's view of the reading queue.
 *
 * Background work that the app never mentions is work the user cannot trust.
 * Whenever songs are queued anywhere, this says so from every screen and keeps
 * a way to stop within reach. It disappears the moment the batch is done.
 */
export function ReadingStatus() {
  const queue = useReadingQueue();

  const outstanding = queue.pending.length + (queue.current ? 1 : 0);
  const visible = outstanding > 0;

  // Lets the scroll container reserve room, so the indicator never covers the
  // end of a page. Set here rather than in CSS because only this component
  // knows whether it is on screen.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) return;
    root.dataset.reading = 'true';
    return () => {
      delete root.dataset.reading;
    };
  }, [visible]);

  if (!visible) return null;

  const settled = queue.done + queue.failed;
  const label = queue.waitingForNetwork
    ? 'Reading paused — offline'
    : queue.paused
      ? 'Reading stopped'
      : queue.current
        ? `Reading ${queue.current.title}`
        : 'Reading songs';

  return (
    <div className="reading-status" role="status">
      <span
        className="reading-status__pip"
        data-idle={queue.running ? undefined : 'true'}
        aria-hidden="true"
      />
      <span className="reading-status__label">{label}</span>
      <span className="reading-status__count">
        {settled} / {queue.total}
      </span>
      {(queue.paused || queue.waitingForNetwork) && (
        <button
          type="button"
          className="reading-status__action"
          onClick={resumeReading}
        >
          Retry
        </button>
      )}
      <button
        type="button"
        className="reading-status__action"
        onClick={() => void stopReading()}
      >
        Stop
      </button>
    </div>
  );
}
