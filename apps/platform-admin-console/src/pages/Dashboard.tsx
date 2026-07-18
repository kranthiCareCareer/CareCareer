import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

/**
 * Platform administration dashboard.
 * Shows aggregate stats and recent activity.
 */
export function Dashboard() {
  const { persona, clearPersona } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1>Platform Dashboard</h1>
        <div className="dashboard__persona">
          <span>
            Signed in as: <strong>{persona?.label}</strong>
          </span>
          <button onClick={clearPersona} className="btn btn--secondary">
            Switch Persona
          </button>
        </div>
      </header>

      <div className="dashboard__stats">
        <div className="stat-card">
          <h3>Total Tenants</h3>
          <p className="stat-card__value">—</p>
        </div>
        <div className="stat-card">
          <h3>Active</h3>
          <p className="stat-card__value stat-card__value--active">—</p>
        </div>
        <div className="stat-card">
          <h3>Provisioning</h3>
          <p className="stat-card__value stat-card__value--provisioning">—</p>
        </div>
        <div className="stat-card">
          <h3>Suspended</h3>
          <p className="stat-card__value stat-card__value--suspended">—</p>
        </div>
        <div className="stat-card">
          <h3>Deactivated</h3>
          <p className="stat-card__value stat-card__value--deactivated">—</p>
        </div>
      </div>

      <nav className="dashboard__nav">
        <Link to="/tenants" className="nav-card">
          <h3>Tenants</h3>
          <p>Manage tenant provisioning and lifecycle</p>
        </Link>
      </nav>
    </div>
  );
}
