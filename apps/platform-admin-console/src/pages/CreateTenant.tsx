import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { apiClient } from '../api/client';

/**
 * Create tenant form.
 * Sends idempotency key, displays correlation ID, handles validation errors.
 */
export function CreateTenant() {
  const { persona } = useAuth();
  const [form, setForm] = useState({ name: '', slug: '', organizationName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    tenantId: string;
    organizationId: string;
    correlationId: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiClient.provisionTenant(form);
      setResult(res);
    } catch (err: unknown) {
      const apiErr = err as { message?: string; code?: string; correlationId?: string };
      setError(apiErr.message ?? 'Provisioning failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!persona) return null;

  return (
    <div className="create-tenant">
      <header className="page-header">
        <Link to="/tenants" className="breadcrumb">
          ← Tenants
        </Link>
        <h1>Create Tenant</h1>
      </header>

      {result && (
        <div className="success-banner" role="status">
          <h3>Tenant provisioned successfully</h3>
          <p>
            Tenant ID: <code>{result.tenantId}</code>
          </p>
          <p>
            Organization ID: <code>{result.organizationId}</code>
          </p>
          <p>
            Correlation ID: <code>{result.correlationId}</code>
          </p>
          <Link to={`/tenants/${result.tenantId}`} className="btn btn--primary">
            View Tenant
          </Link>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label htmlFor="name">Tenant Name</label>
          <input
            id="name"
            type="text"
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            placeholder="MAS Medical Staffing"
          />
        </div>

        <div className="form-group">
          <label htmlFor="slug">Tenant Slug</label>
          <input
            id="slug"
            type="text"
            required
            minLength={2}
            maxLength={50}
            pattern="^[a-z][a-z0-9-]*$"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="input"
            placeholder="mas-medical-staffing"
          />
          <small>Lowercase alphanumeric with hyphens</small>
        </div>

        <div className="form-group">
          <label htmlFor="orgName">Initial Organization Name</label>
          <input
            id="orgName"
            type="text"
            required
            maxLength={200}
            value={form.organizationName}
            onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            className="input"
            placeholder="MAS Corporate"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn btn--primary"
          aria-busy={submitting}
        >
          {submitting ? 'Provisioning...' : 'Provision Tenant'}
        </button>
      </form>
    </div>
  );
}
