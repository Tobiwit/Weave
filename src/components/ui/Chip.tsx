import type { ReactNode } from 'react';
import './ui.css';

interface ChipProps {
  children: ReactNode;
  /** Manually added descriptors carry a subtle mark. */
  manual?: boolean;
  strong?: boolean;
  removed?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  title?: string;
}

export function Chip({
  children,
  manual = false,
  strong = false,
  removed = false,
  onRemove,
  onClick,
  title,
}: ChipProps) {
  const classes = [
    'chip',
    manual ? 'chip--manual' : '',
    strong ? 'chip--strong' : '',
    removed ? 'chip--removed' : '',
    onClick ? 'chip--interactive' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {manual && (
        <span className="chip__mark" aria-hidden="true">
          ✦
        </span>
      )}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          className="chip__action"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${typeof children === 'string' ? children : 'descriptor'}`}
        >
          ×
        </button>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} title={title}>
        {content}
      </button>
    );
  }

  return (
    <span className={classes} title={title}>
      {manual && <span className="u-sr">Added by you: </span>}
      {content}
    </span>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="chip-row">{children}</div>;
}
