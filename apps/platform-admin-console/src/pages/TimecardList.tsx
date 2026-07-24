import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth-context';

interface Timecard {
  id: string;
  assignmentId: string;
  status: string;
  totalHoursWorked: number | null;
  totalBreakMinutes: number;
  submittedAt: string | null;
  approvedAt: string | null;
}

/**
 * Timecard list — admin/client can review and approve timecards.
 */
export function TimecardList() {
  const { token } = useAuth();
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const url = statusFilter
          ? `/api/v1/timekeeping/timecards?status=${statusFilter}`
          : '/api/v1/timekeeping/timecards';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: Timecard[] };
        setTimecards(body.data);
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

  return (
    <div className="page">
      <header className="page__header">
        <h1>Timecards</h1>
      </header>

      <div className="filters">
        <label htmlFor="timecard-status">Filter by status:</label>
        <select
          id="timecard-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="SUBMITTED">Submitted (pending approval)</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {loading && <p role="status">Loading timecards...</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!loading && !error && timecards.length === 0 && (
        <p className="empty-state">No timecards found.</p>
      )}

      {!loading && timecards.length > 0 && (
        <table className="data-table" role="table" aria-label="Timecards">
          <thead>
            <tr>
              <th scope="col">Assignment</th>
              <th scope="col">Hours</th>
              <th scope="col">Break (min)</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {timecards.map((tc) => (
              <tr key={tc.id}>
                <td>{tc.assignmentId.slice(0, 8)}...</td>
                <td>{tc.totalHoursWorked?.toFixed(1) ?? '—'}</td>
                <td>{tc.totalBreakMinutes}</td>
                <td>
                  <span className={`badge badge--${tc.status.toLowerCase()}`}>{tc.status}</span>
                </td>
                <td>{tc.submittedAt ? new Date(tc.submittedAt).toLocaleDateString() : '—'}</td>
                <td>
                  {tc.status === 'SUBMITTED' && (
                    <>
                      <button className="btn btn--sm btn--success">Approve</button>
                      <button className="btn btn--sm btn--danger">Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
