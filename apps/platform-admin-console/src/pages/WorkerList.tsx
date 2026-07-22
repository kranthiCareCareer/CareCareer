import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  profession: string;
  status: string;
}

/**
 * GP-06: Worker list page.
 * Shows all workers for the selected tenant (admin view).
 */
export function WorkerList() {
  const { token } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const url = statusFilter ? `/api/v1/workers?status=${statusFilter}` : '/api/v1/workers';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: Worker[] };
        setWorkers(body.data);
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
        <h1>Workers</h1>
        <Link to="/workers/create" className="btn btn--primary">
          Create Worker
        </Link>
      </header>

      <div className="filters">
        <label htmlFor="status-filter">Filter by status:</label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="APPLICANT">Applicant</option>
          <option value="SCREENING">Screening</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="BLOCKED">Blocked</option>
        </select>
      </div>

      {loading && <p role="status">Loading workers...</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!loading && !error && workers.length === 0 && (
        <p className="empty-state">No workers found.</p>
      )}

      {!loading && workers.length > 0 && (
        <table className="data-table" role="table" aria-label="Workers">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Profession</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link to={`/workers/${w.id}`}>
                    {w.lastName}, {w.firstName}
                  </Link>
                </td>
                <td>{w.profession}</td>
                <td>
                  <span className={`badge badge--${w.status.toLowerCase()}`}>{w.status}</span>
                </td>
                <td>
                  <Link to={`/workers/${w.id}`} className="btn btn--sm">
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
