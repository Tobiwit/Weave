import { Fragment, useState } from 'react';

interface FacetProps {
  label: string;
  /** Terms currently part of the reading, in display order. */
  terms: string[];
  /** Terms the user has taken out, offered back for restoring. */
  removed: string[];
  /** Terms the user added, marked so detected and added stay distinguishable. */
  manual: string[];
  onRemove: (term: string) => void;
  onRestore: (term: string) => void;
  onAdd: (term: string) => void;
  onRemoveManual: (term: string) => void;
  /** Quieter treatment for supporting facets like Style. */
  muted?: boolean;
  addPlaceholder?: string;
}

/**
 * One line of the reading.
 *
 * Reads as a sentence until you touch it. Tapping turns the same words into
 * controls in place — no modal, no separate screen, and the words never move
 * to a different part of the page to be edited.
 */
export function Facet({
  label,
  terms,
  removed,
  manual,
  onRemove,
  onRestore,
  onAdd,
  onRemoveManual,
  muted = false,
  addPlaceholder = 'add a word',
}: FacetProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const isManual = (term: string) =>
    manual.some((entry) => entry.toLowerCase() === term.toLowerCase());

  const commit = () => {
    const value = draft.trim();
    if (value) onAdd(value);
    setDraft('');
  };

  if (!editing && terms.length === 0 && removed.length === 0) return null;

  return (
    <section className={`facet${muted ? ' facet--muted' : ''}${editing ? ' facet--editing' : ''}`}>
      <div className="facet__head">
        <h3 className="facet__label">{label}</h3>
        <button
          type="button"
          className="facet__toggle"
          onClick={() => {
            if (editing) commit();
            setEditing(!editing);
          }}
        >
          {editing ? 'Done' : 'Change'}
        </button>
      </div>

      {editing ? (
        <div className="facet__editor">
          <ul className="facet__list">
            {terms.map((term) => (
              <li key={term}>
                <button
                  type="button"
                  className={`facet__term facet__term--on${
                    isManual(term) ? ' facet__term--mine' : ''
                  }`}
                  onClick={() =>
                    isManual(term) ? onRemoveManual(term) : onRemove(term)
                  }
                  aria-label={`Remove ${term}`}
                >
                  {term}
                </button>
              </li>
            ))}

            {removed.map((term) => (
              <li key={`off-${term}`}>
                <button
                  type="button"
                  className="facet__term facet__term--off"
                  onClick={() => onRestore(term)}
                  aria-label={`Put ${term} back`}
                >
                  {term}
                </button>
              </li>
            ))}
          </ul>

          <form
            className="facet__add"
            onSubmit={(event) => {
              event.preventDefault();
              commit();
            }}
          >
            <input
              className="facet__input"
              value={draft}
              placeholder={addPlaceholder}
              aria-label={`Add to ${label}`}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
            />
          </form>
        </div>
      ) : (
        <button
          type="button"
          className="facet__reading"
          onClick={() => setEditing(true)}
          aria-label={`Change ${label}`}
        >
          {terms.length > 0 ? (
            terms.map((term, index) => (
              <Fragment key={term}>
                {index > 0 && (
                  <span className="facet__sep" aria-hidden="true">
                    ·
                  </span>
                )}
                <span
                  className={`facet__word${isManual(term) ? ' facet__word--mine' : ''}`}
                >
                  {term}
                </span>
              </Fragment>
            ))
          ) : (
            <span className="facet__empty">nothing here yet</span>
          )}
        </button>
      )}
    </section>
  );
}
