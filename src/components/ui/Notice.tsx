import type { ReactNode } from 'react';
import './ui.css';

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="status">
      <span className="notice__dot" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="u-meta">{children}</p>}
    </div>
  );
}
