import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';

interface Facility {
  id: string;
  name: string;
  status: string;
  timezone: string;
  city?: string;
  state?: string;
}

/**
 * GP-05: Facility list page.
 * Shows all facilities for the selected tenant.
 */
export function FacilityList() {
  const { token } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/facilities', {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = (await res.json()) as { data: Facility[] };
        setFacilities(body.data);
        setError(null);
      } catch (e: unknown) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
        }
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
        <h1>Facilities</h1>
        <Link to="/facilities/create" className="btn btn--primary">
          Create Facility
        </Link>
      </header>

      {loading && <p role="status" aria-live="polite">Loading facilities...</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {!loading && !error && facilities.length === 0 && (
        <p className="empty-state">No facilities found. Create your first facility.</p>
      )}

      {!loading && facilities.length > 0 && (
        <table className="data-table" role="table" aria-label="Facilities">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">Timezone</th>
              <th scope="col">Location</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((f) => (
              <tr key={f.id}>
                <td><Link to={`/facilities/${f.id}`}>{f.name}</Link></td>
                <td><span className={`badge badge--${f.status.toLowerCase()}`}>{f.status}</span></td>
                <td>{f.timezone}</td>
                <td>{f.city && f.state ? `${f.city}, ${f.state}` : '—'}</td>
                <td>
                  <Link to={`/facilities/${f.id}`} className="btn btn--sm">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
