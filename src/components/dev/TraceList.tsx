import type { TraceEntry } from '../../types';
import './dev.css';

interface TraceListProps {
  entries: TraceEntry[];
  /** Show the newest entry first, for a trace that is still growing. */
  newestFirst?: boolean;
}

/**
 * The development trace, line by line.
 *
 * Machine register throughout: it is instrumentation, not content, and it is
 * only on screen when the trace setting asks for it.
 */
export function TraceList({ entries, newestFirst = false }: TraceListProps) {
  if (entries.length === 0) {
    return <p className="trace__empty">No trace recorded. Re-read the song to capture one.</p>;
  }
  const ordered = newestFirst ? [...entries].reverse() : entries;

  return (
    <ol className="trace">
      {ordered.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className={`trace__row trace__row--${entry.status}`}>
          <div className="trace__head">
            <span className="trace__stage">{entry.stage}</span>
            <span className="trace__kind">{entry.kind === 'fetch' ? 'asked' : 'derived'}</span>
            <span className="trace__provider">{entry.provider}</span>
            <span className="trace__status">{entry.status}</span>
            {typeof entry.ms === 'number' && <span className="trace__ms">{entry.ms}ms</span>}
          </div>
          {entry.request && <p className="trace__request">{entry.request}</p>}
          {entry.inputs && entry.inputs.length > 0 && (
            <ul className="trace__inputs">
              {entry.inputs.map((input, i) => (
                <li key={i}>← {input}</li>
              ))}
            </ul>
          )}
          {entry.output && Object.keys(entry.output).length > 0 && (
            <dl className="trace__output">
              {Object.entries(entry.output).map(([key, value]) => (
                <div key={key} className="trace__pair">
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {entry.note && <p className="trace__note">{entry.note}</p>}
        </li>
      ))}
    </ol>
  );
}
