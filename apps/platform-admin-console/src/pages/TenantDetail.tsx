import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { Tenant, Organization, EntitlementSet } from '../api/types';
import { useAuth } from '../lib/auth-context';

/**
 * Tenant overview page.
 * Shows identity, lifecycle, organizations, entitlements, and actions.
 */
export function TenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { persona, clearPersona } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    loadTenant();
  }, [tenantId]);

  async function loadTenant() {
    setLoading(true);
    setError(null);
    try {
      const [t, o, e] = await Promise.all([
        apiClient.getTenant(tenantId!),
        apiClient.listOrganizations(tenantId!),
        apiClient.getEntitlements(tenantId!),
      ]);
      setTenant(t);
      setOrgs(o);
      setEntitlements(e);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }

  async function handleLifecycle(action: string) {
    if (!tenant) return;
    const reason = prompt(`Reason for ${action}:`);
    if (!reason) return;

    try {
      if (action === 'activate') {
        await apiClient.activateTenant(tenantId!, reason, tenant.version);
      } else if (action === 'suspend') {
        await apiClient.suspendTenant(tenantId!, reason, tenant.version);
      } else if (action === 'deactivate') {
        if (!confirm('DEACTIVATED is permanent and cannot be reversed. Continue?')) return;
        await apiClient.deactivateTenant(tenantId!, reason, tenant.version);
      }
      await loadTenant();
    } catch (err: unknown) {
      const apiErr = err as { message?: string; code?: string };
      alert(`${action} failed: ${apiErr.message ?? 'Unknown error'} (${apiErr.code ?? ''})`);
    }
  }

  if (loading) return <div className="page-loading">Loading tenant...</div>;
  if (error)
    return (
      <div className="error-banner" role="alert">
        {error}
      </div>
    );
  if (!tenant) return <div className="error-banner">Tenant not found</div>;

  const enabledModules = entitlements
    ? Object.entries(entitlements.modules)
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  return (
    <div className="tenant-detail">
      <header className="page-header">
        <div className="page-header__left">
          <a href="/tenants" className="breadcrumb">
            ← Tenants
          </a>
          <h1>{tenant.name}</h1>
        </div>
        <div className="page-header__right">
          <span>{persona?.label}</span>
          <button onClick={clearPersona} className="btn btn--secondary">
            Switch
          </button>
        </div>
      </header>

      <div className="tenant-detail__grid">
        <section className="card">
          <h3>Identity</h3>
          <dl className="dl">
            <dt>Slug</dt>
            <dd>
              <code>{tenant.slug}</code>
            </dd>
            <dt>Status</dt>
            <dd>
              <span className={`badge badge--${tenant.status.toLowerCase()}`}>{tenant.status}</span>
            </dd>
            <dt>Version</dt>
            <dd>{tenant.version}</dd>
            <dt>Created</dt>
            <dd>{new Date(tenant.createdAt).toLocaleString()}</dd>
            <dt>Updated</dt>
            <dd>{new Date(tenant.updatedAt).toLocaleString()}</dd>
          </dl>
        </section>

        <section className="card">
          <h3>Organizations ({orgs.length})</h3>
          {orgs.length === 0 ? (
            <p className="empty-state">No organizations</p>
          ) : (
            <ul className="list">
              {orgs.map((o) => (
                <li key={o.id}>{o.name}</li>
              ))}
            </ul>
          )}
          <a href={`/tenants/${tenantId}/organizations`} className="btn btn--secondary">
            Manage
          </a>
        </section>

        <section className="card">
          <h3>Entitlements</h3>
          {enabledModules.length === 0 ? (
            <p className="empty-state">No modules enabled</p>
          ) : (
            <ul className="list">
              {enabledModules.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <a href={`/tenants/${tenantId}/entitlements`} className="btn btn--secondary">
            Manage
          </a>
        </section>

        <section className="card">
          <h3>Lifecycle Actions</h3>
          <div className="lifecycle-actions">
            {tenant.status === 'PROVISIONING' && (
              <button onClick={() => handleLifecycle('activate')} className="btn btn--primary">
                Activate
              </button>
            )}
            {tenant.status === 'ACTIVE' && (
              <>
                <button onClick={() => handleLifecycle('suspend')} className="btn btn--secondary">
                  Suspend
                </button>
                <button onClick={() => handleLifecycle('deactivate')} className="btn btn--danger">
                  Deactivate
                </button>
              </>
            )}
            {tenant.status === 'SUSPENDED' && (
              <>
                <button onClick={() => handleLifecycle('activate')} className="btn btn--primary">
                  Reactivate
                </button>
                <button onClick={() => handleLifecycle('deactivate')} className="btn btn--danger">
                  Deactivate
                </button>
              </>
            )}
            {tenant.status === 'DEACTIVATED' && (
              <p className="empty-state">This tenant is permanently deactivated.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
