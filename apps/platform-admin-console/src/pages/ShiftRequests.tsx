import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth-context';

interface ShiftRequest {
  id: string;
  shiftId: string;
  workerId: string;
  status: string;
  submittedAt: string;
  version: number;
}

/**
 * Shift requests page — client/admin reviews and confirms/rejects requests.
 */
export function ShiftRequests() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        // For MVP, show all pending requests (admin view)
        const res = await fetch('/api/v1/marketplace/shifts/all/requests', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: ShiftRequest[] };
        setRequests(body.data);
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

  async function handleConfirm(requestId: string, version: number) {
    try {
      const res = await fetch(`/api/v1/marketplace/requests/${requestId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ expectedVersion: version }),
      });
      if (!res.ok) throw new Error('Confirmation failed');
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'CONFIRMED' } : r)),
      );
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  async function handleReject(requestId: string, version: number) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/v1/marketplace/requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ reason, expectedVersion: version }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'REJECTED' } : r)),
      );
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Shift Requests</h1>
      </header>

      {loading && <p role="status">Loading requests...</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {!loading && !error && requests.length === 0 && (
        <p className="empty-state">No pending shift requests.</p>
      )}

      {!loading && requests.length > 0 && (
        <table className="data-table" role="table" aria-label="Shift Requests">
          <thead>
            <tr>
              <th scope="col">Shift</th>
              <th scope="col">Worker</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.shiftId.slice(0, 8)}...</td>
                <td>{r.workerId.slice(0, 8)}...</td>
                <td>
                  <span className={`badge badge--${r.status.toLowerCase()}`}>{r.status}</span>
                </td>
                <td>{new Date(r.submittedAt).toLocaleDateString()}</td>
                <td>
                  {(r.status === 'REQUESTED' || r.status === 'UNDER_REVIEW') && (
                    <>
                      <button
                        className="btn btn--sm btn--success"
                        onClick={() => handleConfirm(r.id, r.version)}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => handleReject(r.id, r.version)}
                      >
                        Reject
                      </button>
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
