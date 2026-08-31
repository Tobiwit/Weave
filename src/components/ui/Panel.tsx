import type { ReactNode } from 'react';
import './ui.css';

interface PanelProps {
  children: ReactNode;
  quiet?: boolean;
  flush?: boolean;
  className?: string;
  as?: 'div' | 'section' | 'article';
}

/** A softly suspended surface. Deliberately not a dashboard card. */
export function Panel({
  children,
  quiet = false,
  flush = false,
  className,
  as: Tag = 'div',
}: PanelProps) {
  const classes = [
    'panel',
    quiet ? 'panel--quiet' : '',
    flush ? 'panel--flush' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <Tag className={classes}>{children}</Tag>;
}
