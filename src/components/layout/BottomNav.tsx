import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { OrbitWeave } from '../brand/OrbitWeave';
import './layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const PLAYLISTS: NavItem = {
  to: '/playlists',
  label: 'Playlists',
  icon: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M4 7h11M4 12h11M4 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 17a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

const UNIVERSE: NavItem = {
  to: '/universe',
  label: 'Universe',
  icon: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.5 14a3.5 3.5 0 0 1 7 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="18.5" r="1.4" fill="currentColor" />
    </svg>
  ),
};

/**
 * The only permanent navigation: a floating bar with the mark at its centre.
 *
 * The mark is the way home, to reading a new song, which is the app's one
 * primary act. Playlists and Universe sit either side as pills.
 */
export function BottomNav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__bar">
        <Tab item={PLAYLISTS} />
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav__home${isActive ? ' nav__home--active' : ''}`}
          aria-label="Read a song"
        >
          {({ isActive }) => (
            <OrbitWeave size={34} mode={isActive ? 'idle' : 'still'} weight={1.35} />
          )}
        </NavLink>
        <Tab item={UNIVERSE} />
      </div>
    </nav>
  );
}

function Tab({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `nav__item${isActive ? ' nav__item--active' : ''}`}
    >
      <span className="nav__icon">{item.icon}</span>
      <span className="nav__label">{item.label}</span>
    </NavLink>
  );
}
