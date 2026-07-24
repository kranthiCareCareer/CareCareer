import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth-context';

interface Shift {
  id: string;
  role: string;
  startTime: string;
  endTime: string;
  businessDate: string;
  payRateCents: number;
  requiredWorkerCount: number;
  filledWorkerCount: number;
}

/**
 * Marketplace page — workers browse and request available shifts.
 */
export function MarketplaceShifts() {
  const { token } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/marketplace/shifts', {
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
  }, [token]);

  async function requestShift(shiftId: string) {
    try {
      setRequesting(shiftId);
      const res = await fetch('/api/v1/marketplace/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ shiftId, workerId: 'self' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Request failed');
      }
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRequesting(null);
    }
  }

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
        <h1>Available Shifts</h1>
      </header>

      {loading && <p role="status">Loading available shifts...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && !error && shifts.length === 0 && (
        <p className="empty-state">No shifts available at this time.</p>
      )}

      {!loading && shifts.length > 0 && (
        <div className="card-grid">
          {shifts.map((s) => (
            <article key={s.id} className="card">
              <div className="card__header">
                <span className="badge">{s.role}</span>
                <span className="card__date">{s.businessDate}</span>
              </div>
              <div className="card__body">
                <p>{formatTime(s.startTime)} – {formatTime(s.endTime)}</p>
                <p className="card__rate">${(s.payRateCents / 100).toFixed(2)}/hr</p>
                <p className="card__capacity">
                  {s.requiredWorkerCount - s.filledWorkerCount} spot(s) remaining
                </p>
              </div>
              <div className="card__footer">
                <button
                  className="btn btn--primary"
                  disabled={requesting === s.id}
                  onClick={() => requestShift(s.id)}
                  aria-label={`Request shift on ${s.businessDate}`}
                >
                  {requesting === s.id ? 'Requesting...' : 'Request Shift'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
