import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';

interface Shift {
  id: string;
  facilityId: string;
  role: string;
  status: string;
  startTime: string;
  endTime: string;
  businessDate: string;
  requiredWorkerCount: number;
  filledWorkerCount: number;
  payRateCents: number;
}

/**
 * Shift list page — shows shifts for admin/client view.
 */
export function ShiftList() {
  const { token } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const url = statusFilter ? `/api/v1/shifts?status=${statusFilter}` : '/api/v1/shifts';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: Shift[] };
        setShifts(body.data);
        setError(null);
      } catch (e: unknown) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token, statusFilter]);

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Shifts</h1>
        <Link to="/shifts/create" className="btn btn--primary">
          Create Shift
        </Link>
      </header>

      <div className="filters">
        <label htmlFor="shift-status-filter">Filter by status:</label>
        <select
          id="shift-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="PARTIALLY_FILLED">Partially Filled</option>
          <option value="FILLED">Filled</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {loading && <p role="status">Loading shifts...</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!loading && !error && shifts.length === 0 && <p className="empty-state">No shifts found.</p>}

      {!loading && shifts.length > 0 && (
        <table className="data-table" role="table" aria-label="Shifts">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Time</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Staffing</th>
              <th scope="col">Pay Rate</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>{s.businessDate}</td>
                <td>
                  {formatTime(s.startTime)} – {formatTime(s.endTime)}
                </td>
                <td>{s.role}</td>
                <td>
                  <span className={`badge badge--${s.status.toLowerCase()}`}>{s.status}</span>
                </td>
                <td>
                  {s.filledWorkerCount}/{s.requiredWorkerCount}
                </td>
                <td>${(s.payRateCents / 100).toFixed(2)}/hr</td>
                <td>
                  <Link to={`/shifts/${s.id}`} className="btn btn--sm">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
