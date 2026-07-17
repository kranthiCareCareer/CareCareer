import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { Organization } from '../api/types';

export function Organizations() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) loadOrgs();
  }, [tenantId]);

  async function loadOrgs() {
    try {
      const data = await apiClient.listOrganizations(tenantId!);
      setOrgs(data);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to load');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await apiClient.createOrganization(tenantId!, newName.trim());
      setNewName('');
      await loadOrgs();
    } catch (err: unknown) {
      const apiErr = err as { message?: string; code?: string };
      setError(apiErr.message ?? 'Creation failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="organizations-page">
      <header className="page-header">
        <div className="page-header__left">
          <a href={`/tenants/${tenantId}`} className="breadcrumb">
            ← Tenant
          </a>
          <h1>Organizations</h1>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="inline-form">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New organization name"
          className="input"
          required
          aria-label="Organization name"
        />
        <button type="submit" disabled={creating} className="btn btn--primary">
          {creating ? 'Creating...' : 'Create Organization'}
        </button>
      </form>

      {orgs.length === 0 ? (
        <p className="empty-state">No organizations yet.</p>
      ) : (
        <ul className="list">
          {orgs.map((org) => (
            <li key={org.id} className="list-item">
              <strong>{org.name}</strong>
              <small>Created: {new Date(org.createdAt).toLocaleDateString()}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
