import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { EntitlementSet, ModuleKey } from '../api/types';

const MODULE_LABELS: Record<string, string> = {
  core: 'Core Platform',
  workforce: 'Workforce Management',
  credentialing: 'Credentialing',
  scheduling: 'Scheduling',
  timekeeping: 'Timekeeping',
  pay_bill_preview: 'Pay & Bill Preview',
  recruiting: 'Recruiting',
  engagement: 'Engagement',
  vms: 'VMS',
  analytics: 'Analytics',
};

export function Entitlements() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [entitlements, setEntitlements] = useState<EntitlementSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) loadEntitlements();
  }, [tenantId]);

  async function loadEntitlements() {
    try {
      const e = await apiClient.getEntitlements(tenantId!);
      setEntitlements(e);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load');
    }
  }

  async function toggleModule(moduleKey: ModuleKey) {
    if (!entitlements) return;
    setSaving(true);
    setError(null);
    const updated = { [moduleKey]: !entitlements.modules[moduleKey] };
    try {
      await apiClient.updateEntitlements(tenantId!, updated, entitlements.version);
      await loadEntitlements();
    } catch (err: unknown) {
      const apiErr = err as { message?: string; code?: string };
      setError(
        apiErr.code === 'VERSION_CONFLICT'
          ? 'Version conflict — another user modified this. Please refresh.'
          : (apiErr.message ?? 'Update failed'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="entitlements-page">
      <header className="page-header">
        <div className="page-header__left">
          <Link to={`/tenants/${tenantId}`} className="breadcrumb">
            ← Tenant
          </Link>
          <h1>Entitlements</h1>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <p className="description">
        Entitlements represent purchased or authorized platform modules. Toggle to enable or disable
        capabilities for this tenant.
      </p>

      {!entitlements ? (
        <div className="page-loading">Loading entitlements...</div>
      ) : (
        <>
          <div className="entitlements-grid">
            {Object.entries(entitlements.modules).map(([key, enabled]) => (
              <label
                key={key}
                className={`entitlement-card ${enabled ? 'entitlement-card--enabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleModule(key as ModuleKey)}
                  disabled={saving || key === 'core'}
                />
                <span className="entitlement-card__label">{MODULE_LABELS[key] ?? key}</span>
                {key === 'core' && <small>(always enabled)</small>}
              </label>
            ))}
          </div>
          <p className="meta">Version: {entitlements.version}</p>
        </>
      )}
    </div>
  );
}
