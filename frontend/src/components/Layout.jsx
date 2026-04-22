// src/components/Layout.jsx
import { useAuth } from '../context/AuthContext';

export default function Layout({ children, activePage, onNavigate }) {
  const { user, logout, isAdmin } = useAuth();

  const initials = user?.full_name
    ?.split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const navItems = [
    { id: 'book',       label: 'Book Hardware', icon: '◈', show: true },
    { id: 'bookings',   label: 'My Bookings',   icon: '≡', show: !isAdmin },
    { id: 'admin',      label: 'Admin Panel',   icon: '⬡', show: isAdmin },
  ].filter(i => i.show);

  const roleBadgeClass = {
    Admin:     'badge-red',
    Professor: 'badge-violet',
    Student:   'badge-cyan',
  }[user?.role] || 'badge-muted';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo-icon">⬡</div>
          <div>
            <div className="sidebar-brand-name">Silicon<br/>Scheduler</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-lbl">Navigation</span>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item${activePage === item.id ? ' active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-tile">
            <div className="user-avatar">{initials}</div>
            <div className="user-tile-info">
              <div className="user-tile-name">{user?.full_name || 'User'}</div>
              <div className="user-tile-role">{user?.role}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
          </div>
        </div>
      </aside>

      <main className="page-main">{children}</main>
    </div>
  );
}
