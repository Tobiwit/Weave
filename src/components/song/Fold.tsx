import { useState, type ReactNode } from 'react';
import './song.css';

interface FoldProps {
  name: string;
  /** A word or a count on the right of the line. Never a sentence. */
  note?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A section that is a single line until it is asked for.
 *
 * The shut state is the whole point: the page should be readable as four or
 * five lines of type, with everything underneath available and none of it
 * present. The body stays in the document and grows, so opening one does not
 * shove the others around in a jump.
 */
export function Fold({ name, note, defaultOpen = false, children }: FoldProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`fold${open ? ' fold--open' : ''}`}>
      <button
        type="button"
        className="fold__head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="fold__name">{name}</span>
        {note && <span className="fold__note">{note}</span>}
      </button>

      <div className="fold__body" inert={!open}>
        <div className="fold__inner">{children}</div>
      </div>
    </section>
  );
}
