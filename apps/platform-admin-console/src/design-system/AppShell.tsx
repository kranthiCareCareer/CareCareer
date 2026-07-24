import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const ADMIN_NAV: NavItem[] = [
  { path: '/', label: 'Command Center', icon: '◉' },
  { path: '/workforce', label: 'Workforce', icon: '👥' },
  { path: '/recruiting', label: 'Recruiting', icon: '🎯' },
  { path: '/credentialing', label: 'Credentialing', icon: '✓' },
  { path: '/scheduling', label: 'Scheduling', icon: '📅' },
  { path: '/clients', label: 'Clients', icon: '🏥' },
  { path: '/time', label: 'Time & Pay', icon: '⏱' },
  { path: '/analytics', label: 'Analytics', icon: '📊' },
  { path: '/admin', label: 'Administration', icon: '⚙' },
];

const WORKER_NAV: NavItem[] = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/marketplace', label: 'Opportunities', icon: '🔍' },
  { path: '/schedule', label: 'My Schedule', icon: '📅' },
  { path: '/time', label: 'Time & Pay', icon: '⏱' },
  { path: '/credentials', label: 'Credentials', icon: '✓' },
  { path: '/messages', label: 'Messages', icon: '💬' },
];

const CLIENT_NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '◉' },
  { path: '/staff-requests', label: 'Staff Requests', icon: '📋' },
  { path: '/active-staff', label: 'Active Staff', icon: '👥' },
  { path: '/timesheets', label: 'Timesheets', icon: '⏱' },
  { path: '/invoices', label: 'Invoices', icon: '💰' },
];

function getNavForRole(role: string | undefined): NavItem[] {
  switch (role) {
    case 'WORKER':
      return WORKER_NAV;
    case 'CLIENT':
      return CLIENT_NAV;
    default:
      return ADMIN_NAV;
  }
}

interface AppShellProps {
  children: ReactNode;
}

/**
 * CareCareer Application Shell
 *
 * Provides the unified platform experience:
 * - Dark sidebar with role-adaptive navigation
 * - Top header with search, notifications, user menu
 * - Main content area
 */
export function AppShell({ children }: AppShellProps) {
  const { persona, clearPersona } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navItems = getNavForRole(persona?.role);

  return (
    <div className="app-shell" data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}>
      {/* Sidebar */}
      <aside className="app-shell__sidebar" aria-label="Main navigation">
        <div className="app-shell__sidebar-header">
          <Link to="/" className="app-shell__logo">
            {sidebarCollapsed ? 'CC' : 'CareCareer'}
          </Link>
          <button
            className="app-shell__collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="app-shell__nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`app-shell__nav-item ${
                location.pathname === item.path ? 'app-shell__nav-item--active' : ''
              }`}
              aria-current={location.pathname === item.path ? 'page' : undefined}
            >
              <span className="app-shell__nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="app-shell__nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="app-shell__sidebar-footer">
          {!sidebarCollapsed && (
            <div className="app-shell__user-info">
              <span className="app-shell__user-name">{persona?.label}</span>
              <span className="app-shell__user-role">{persona?.role}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="app-shell__main">
        {/* Header */}
        <header className="app-shell__header">
          <div className="app-shell__search">
            <input
              type="search"
              placeholder="Search workers, shifts, facilities... (⌘K)"
              className="app-shell__search-input"
              aria-label="Global search"
            />
          </div>

          <div className="app-shell__header-actions">
            <button className="app-shell__header-btn" aria-label="AI Assistant">
              <span className="app-shell__ai-icon">✦</span>
            </button>
            <button className="app-shell__header-btn" aria-label="Notifications">
              🔔
            </button>
            <button className="app-shell__header-btn app-shell__user-btn" onClick={clearPersona}>
              <span className="app-shell__avatar">
                {persona?.label?.charAt(0) ?? 'U'}
              </span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
