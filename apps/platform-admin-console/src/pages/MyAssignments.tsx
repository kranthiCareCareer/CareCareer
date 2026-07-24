import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth-context';

interface Assignment {
  id: string;
  shiftId: string;
  status: string;
  confirmedAt: string;
}

/**
 * Worker assignments page — shows current and past assignments.
 */
export function MyAssignments() {
  const { token } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/assignments', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: Assignment[] };
        setAssignments(body.data);
        setError(null);
      } catch (e: unknown) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token]);

  return (
    <div className="page">
      <header className="page__header">
        <h1>My Assignments</h1>
      </header>

      {loading && <p role="status">Loading assignments...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && !error && assignments.length === 0 && (
        <p className="empty-state">No assignments yet.</p>
      )}

      {!loading && assignments.length > 0 && (
        <table className="data-table" role="table" aria-label="My Assignments">
          <thead>
            <tr>
              <th scope="col">Shift</th>
              <th scope="col">Status</th>
              <th scope="col">Confirmed</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.shiftId.slice(0, 8)}...</td>
                <td>
                  <span className={`badge badge--${a.status.toLowerCase()}`}>{a.status}</span>
                </td>
                <td>{new Date(a.confirmedAt).toLocaleDateString()}</td>
                <td>
                  {a.status === 'CONFIRMED' && (
                    <button className="btn btn--sm btn--primary">Clock In</button>
                  )}
                  {a.status === 'CHECKED_IN' && (
                    <button className="btn btn--sm btn--primary">Clock Out</button>
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
