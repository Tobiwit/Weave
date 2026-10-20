import { useId, useState, type ReactNode } from 'react';
import './ui.css';

interface DisclosureProps {
  /** The closed label, e.g. "Show the working". */
  label: string;
  /** Shown beside the label while closed, e.g. a count. */
  note?: ReactNode;
  children: ReactNode;
}

/**
 * Detail kept out of the way until asked for: weights, traces, the working
 * behind a number. One line closed; the content mounts only when opened, so
 * a closed one costs nothing to render.
 */
export function Disclosure({ label, note, children }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={`disclosure${open ? ' disclosure--open' : ''}`}>
      <button
        type="button"
        className="disclosure__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="disclosure__arc" aria-hidden="true" />
        <span>{open ? 'Hide' : label}</span>
        {!open && note && <span className="disclosure__note">{note}</span>}
      </button>
      {open && (
        <div id={id} className="disclosure__body">
          {children}
        </div>
      )}
    </div>
  );
}
