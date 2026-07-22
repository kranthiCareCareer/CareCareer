import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';

interface Facility {
  id: string;
  name: string;
  status: string;
  timezone: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  geofenceVersion: number;
  version: number;
}

interface Department {
  id: string;
  name: string;
  status: string;
}

/**
 * GP-05: Facility detail page.
 * Shows facility info, departments, and actions.
 */
export function FacilityDetail() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const { token } = useAuth();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token ?? ''}` };
        const [facRes, deptRes] = await Promise.all([
          fetch(`/api/v1/facilities/${facilityId ?? ''}`, { headers, signal: controller.signal }),
          fetch(`/api/v1/facilities/${facilityId ?? ''}/departments`, { headers, signal: controller.signal }),
        ]);
        if (!facRes.ok) throw new Error(facRes.status === 404 ? 'Facility not found' : `HTTP ${String(facRes.status)}`);
        const facBody = (await facRes.json()) as { data: Facility };
        setFacility(facBody.data);
        if (deptRes.ok) {
          const deptBody = (await deptRes.json()) as { data: Department[] };
          setDepartments(deptBody.data);
        }
        setError(null);
      } catch (e: unknown) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [facilityId, token]);

  if (loading) return <p role="status">Loading facility...</p>;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!facility) return <p>Facility not found</p>;

  return (
    <div className="page">
      <nav aria-label="Breadcrumb">
        <Link to="/facilities">← Facilities</Link>
      </nav>

      <header className="page__header">
        <h1>{facility.name}</h1>
        <span className={`badge badge--${facility.status.toLowerCase()}`}>{facility.status}</span>
      </header>

      <section aria-label="Facility details">
        <dl className="detail-list">
          <dt>Timezone</dt><dd>{facility.timezone}</dd>
          <dt>Address</dt><dd>{facility.addressLine1 ?? '—'}</dd>
          <dt>Location</dt><dd>{facility.city && facility.state ? `${facility.city}, ${facility.state} ${facility.zip ?? ''}` : '—'}</dd>
          <dt>Geofence Version</dt><dd>{facility.geofenceVersion}</dd>
          <dt>Version</dt><dd>{facility.version}</dd>
        </dl>
      </section>

      <section aria-label="Departments">
        <h2>Departments</h2>
        {departments.length === 0 && <p className="empty-state">No departments yet.</p>}
        {departments.length > 0 && (
          <ul className="department-list">
            {departments.map((d) => (
              <li key={d.id}>
                <span>{d.name}</span>
                <span className={`badge badge--${d.status.toLowerCase()}`}>{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
