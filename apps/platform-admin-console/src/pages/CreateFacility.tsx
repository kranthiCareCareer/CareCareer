import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';

/**
 * GP-05: Create facility form.
 * Validates timezone is required. Calls staffing-service API.
 */
export function CreateFacility() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      clientId: form.get('clientId') as string,
      name: form.get('name') as string,
      timezone: form.get('timezone') as string,
      addressLine1: (form.get('addressLine1') as string) || undefined,
      city: (form.get('city') as string) || undefined,
      state: (form.get('state') as string) || undefined,
      zip: (form.get('zip') as string) || undefined,
    };

    if (!body.timezone) {
      setError('Timezone is required');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/v1/facilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? `HTTP ${String(res.status)}`);
      }
      const result = (await res.json()) as { data: { facilityId: string } };
      navigate(`/facilities/${result.data.facilityId}`);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Create Facility</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="form"
        aria-label="Create facility form"
      >
        <div className="form-group">
          <label htmlFor="name">Facility Name *</label>
          <input id="name" name="name" required maxLength={200} />
        </div>

        <div className="form-group">
          <label htmlFor="timezone">Timezone *</label>
          <input id="timezone" name="timezone" required placeholder="America/New_York" />
        </div>

        <div className="form-group">
          <label htmlFor="clientId">Client ID *</label>
          <input id="clientId" name="clientId" required placeholder="UUID" />
        </div>

        <div className="form-group">
          <label htmlFor="addressLine1">Address</label>
          <input id="addressLine1" name="addressLine1" maxLength={300} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="city">City</label>
            <input id="city" name="city" maxLength={100} />
          </div>
          <div className="form-group">
            <label htmlFor="state">State</label>
            <input id="state" name="state" maxLength={50} />
          </div>
          <div className="form-group">
            <label htmlFor="zip">ZIP</label>
            <input id="zip" name="zip" maxLength={20} />
          </div>
        </div>

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Facility'}
        </button>
      </form>
    </div>
  );
}
