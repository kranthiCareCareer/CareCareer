import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';

/**
 * Create shift page — client/admin can create a new shift.
 */
export function CreateShift() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const dto = {
      facilityId: form.get('facilityId') as string,
      role: form.get('role') as string,
      startTime: new Date(form.get('startTime') as string).toISOString(),
      endTime: new Date(form.get('endTime') as string).toISOString(),
      businessDate: form.get('businessDate') as string,
      requiredWorkerCount: parseInt(form.get('requiredWorkerCount') as string, 10),
      payRateCents: Math.round(parseFloat(form.get('payRate') as string) * 100),
      billRateCents: Math.round(parseFloat(form.get('billRate') as string) * 100),
      notes: (form.get('notes') as string) || undefined,
    };

    try {
      setLoading(true);
      const res = await fetch('/api/v1/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${String(res.status)}`);
      }
      navigate('/shifts');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Create Shift</h1>
      </header>

      {error && <p role="alert" className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="form">
        <div className="form__field">
          <label htmlFor="facilityId">Facility ID</label>
          <input id="facilityId" name="facilityId" required placeholder="UUID of facility" />
        </div>
        <div className="form__field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" required>
            <option value="RN">RN</option>
            <option value="LPN">LPN</option>
            <option value="CNA">CNA</option>
            <option value="RT">RT</option>
            <option value="ALLIED">Allied</option>
          </select>
        </div>
        <div className="form__field">
          <label htmlFor="businessDate">Business Date</label>
          <input id="businessDate" name="businessDate" type="date" required />
        </div>
        <div className="form__field">
          <label htmlFor="startTime">Start Time</label>
          <input id="startTime" name="startTime" type="datetime-local" required />
        </div>
        <div className="form__field">
          <label htmlFor="endTime">End Time</label>
          <input id="endTime" name="endTime" type="datetime-local" required />
        </div>
        <div className="form__field">
          <label htmlFor="requiredWorkerCount">Workers Needed</label>
          <input id="requiredWorkerCount" name="requiredWorkerCount" type="number" min="1" defaultValue="1" required />
        </div>
        <div className="form__field">
          <label htmlFor="payRate">Pay Rate ($/hr)</label>
          <input id="payRate" name="payRate" type="number" step="0.01" min="0.01" required />
        </div>
        <div className="form__field">
          <label htmlFor="billRate">Bill Rate ($/hr)</label>
          <input id="billRate" name="billRate" type="number" step="0.01" min="0.01" required />
        </div>
        <div className="form__field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={3} />
        </div>
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Shift'}
        </button>
      </form>
    </div>
  );
}
