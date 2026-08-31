import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import './layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Analyze',
    icon: (
      <svg viewBox="0 0 22 22" width="21" height="21" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="6.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14.6 14.6 19 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/playlists',
    label: 'Playlists',
    icon: (
      <svg viewBox="0 0 22 22" width="21" height="21" fill="none" aria-hidden="true">
        <path
          d="M3 5.5h11M3 11h11M3 16.5h7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="16.5" cy="15.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    to: '/universe',
    label: 'Universe',
    icon: (
      <svg viewBox="0 0 22 22" width="21" height="21" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="15" cy="14.5" r="2.4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="15.5" cy="6" r="1.4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

/** The only permanent navigation. Everything else is entered contextually. */
export function BottomNav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__inner">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav__item${isActive ? ' nav__item--active' : ''}`}
          >
            <span className="nav__icon">{item.icon}</span>
            <span className="nav__label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
