import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/documents', label: 'Documents' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/tracker', label: 'Tracker' },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" />
          CV Platform
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'navlink active' : 'navlink')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="account">
          <button
            className="avatar"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt="" />
              : <span className="initials">{user?.name?.[0] ?? '?'}</span>}
            <span className="who">{user?.name}</span>
            <span className="chevron">▾</span>
          </button>

          {menuOpen && (
            <>
              {/* Click anywhere to dismiss, rather than trapping the menu open. */}
              <div className="scrim" onClick={() => setMenuOpen(false)} />
              <div className="menu">
                <div className="menu-head">
                  <div className="menu-name">{user?.name}</div>
                  <div className="menu-email">{user?.email}</div>
                </div>
                <NavLink to="/profile" className="menu-item" onClick={() => setMenuOpen(false)}>
                  Profile
                </NavLink>
                <button className="menu-item danger" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
