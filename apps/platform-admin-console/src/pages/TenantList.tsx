import { useAuth } from '../lib/auth-context';

/**
 * Tenant list page with search, filter, and create actions.
 */
export function TenantList() {
  const { persona, clearPersona } = useAuth();

  return (
    <div className="tenant-list">
      <header className="page-header">
        <div className="page-header__left">
          <a href="/" className="breadcrumb">
            ← Dashboard
          </a>
          <h1>Tenants</h1>
        </div>
        <div className="page-header__right">
          <span>{persona?.label}</span>
          <button onClick={clearPersona} className="btn btn--secondary">
            Switch
          </button>
        </div>
      </header>

      <div className="tenant-list__toolbar">
        <input
          type="search"
          placeholder="Search tenants..."
          className="input"
          aria-label="Search tenants"
        />
        <select className="select" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PROVISIONING">Provisioning</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DEACTIVATED">Deactivated</option>
        </select>
        <a href="/tenants/create" className="btn btn--primary">
          Create Tenant
        </a>
      </div>

      <div className="tenant-list__empty">
        <p>Connect to the platform-service to view tenants.</p>
        <p>
          Run <code>pnpm demo:up</code> to start the demo stack.
        </p>
      </div>
    </div>
  );
}
