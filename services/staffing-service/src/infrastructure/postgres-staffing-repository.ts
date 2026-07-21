import type { TransactionClient } from '@carecareer/database';

import type { StaffingRepository } from '../application/ports/staffing-repository.js';
import type { Department } from '../domain/department.js';
import type { Facility } from '../domain/facility.js';

/**
 * PostgreSQL implementation of the staffing repository.
 * All queries execute inside TenantAwareTransaction (RLS enforced).
 */
export class PostgresStaffingRepository implements StaffingRepository {
  async createFacility(tx: TransactionClient, f: Facility): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.facilities (
        id, tenant_id, client_id, name, status, address_line1, city, state, zip,
        country, timezone, latitude, longitude, geofence_radius_meters,
        geofence_version, version, created_at, updated_at
      ) VALUES (
        ${f.id}::uuid, ${f.tenantId}::uuid, ${f.clientId}::uuid, ${f.name},
        ${f.status}, ${f.addressLine1 ?? null}, ${f.city ?? null},
        ${f.state ?? null}, ${f.zip ?? null}, ${f.country}, ${f.timezone},
        ${f.latitude ?? null}::decimal, ${f.longitude ?? null}::decimal,
        ${f.geofenceRadiusMeters ?? null}::int, ${f.geofenceVersion},
        ${f.version}, ${f.createdAt.toISOString()}::timestamptz,
        ${f.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getFacilityById(tx: TransactionClient, facilityId: string): Promise<Facility | null> {
    const rows = await tx.$queryRaw<FacilityRow>`
      SELECT * FROM staffing.facilities WHERE id = ${facilityId}::uuid`;
    if (rows.length === 0) return null;
    return mapFacility(rows[0]!);
  }

  async listFacilities(tx: TransactionClient): Promise<Facility[]> {
    const rows = await tx.$queryRaw<FacilityRow>`
      SELECT * FROM staffing.facilities ORDER BY name`;
    return rows.map(mapFacility);
  }

  async updateFacility(tx: TransactionClient, f: Facility): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.facilities SET
        name = ${f.name}, status = ${f.status}, timezone = ${f.timezone},
        address_line1 = ${f.addressLine1 ?? null}, city = ${f.city ?? null},
        state = ${f.state ?? null}, zip = ${f.zip ?? null},
        latitude = ${f.latitude ?? null}::decimal,
        longitude = ${f.longitude ?? null}::decimal,
        geofence_radius_meters = ${f.geofenceRadiusMeters ?? null}::int,
        geofence_version = ${f.geofenceVersion},
        version = ${f.version}, updated_at = NOW()
      WHERE id = ${f.id}::uuid AND version = ${f.version - 1}`;
    if (count === 0) {
      throw new Error('VERSION_CONFLICT');
    }
  }

  async createDepartment(tx: TransactionClient, d: Department): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.departments (id, tenant_id, facility_id, name, status, version, created_at, updated_at)
      VALUES (${d.id}::uuid, ${d.tenantId}::uuid, ${d.facilityId}::uuid, ${d.name}, ${d.status}, ${d.version},
        ${d.createdAt.toISOString()}::timestamptz, ${d.updatedAt.toISOString()}::timestamptz)`;
  }

  async getDepartmentById(tx: TransactionClient, departmentId: string): Promise<Department | null> {
    const rows = await tx.$queryRaw<DepartmentRow>`
      SELECT * FROM staffing.departments WHERE id = ${departmentId}::uuid`;
    if (rows.length === 0) return null;
    return mapDepartment(rows[0]!);
  }

  async listDepartmentsByFacility(tx: TransactionClient, facilityId: string): Promise<Department[]> {
    const rows = await tx.$queryRaw<DepartmentRow>`
      SELECT * FROM staffing.departments WHERE facility_id = ${facilityId}::uuid ORDER BY name`;
    return rows.map(mapDepartment);
  }
}

interface FacilityRow {
  id: string; tenant_id: string; client_id: string; name: string; status: string;
  address_line1: string | null; address_line2: string | null;
  city: string | null; state: string | null; zip: string | null; country: string;
  timezone: string; latitude: number | null; longitude: number | null;
  geofence_radius_meters: number | null; geofence_version: number;
  created_at: string; updated_at: string; version: number;
}

interface DepartmentRow {
  id: string; tenant_id: string; facility_id: string; name: string;
  status: string; created_at: string; updated_at: string; version: number;
}

function mapFacility(r: FacilityRow): Facility {
  return {
    id: r.id, tenantId: r.tenant_id, clientId: r.client_id, name: r.name,
    status: r.status as Facility['status'],
    addressLine1: r.address_line1 ?? undefined, addressLine2: r.address_line2 ?? undefined,
    city: r.city ?? undefined, state: r.state ?? undefined, zip: r.zip ?? undefined,
    country: r.country, timezone: r.timezone,
    latitude: r.latitude ?? undefined, longitude: r.longitude ?? undefined,
    geofenceRadiusMeters: r.geofence_radius_meters ?? undefined,
    geofenceVersion: r.geofence_version,
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at), version: r.version,
  };
}

function mapDepartment(r: DepartmentRow): Department {
  return {
    id: r.id, tenantId: r.tenant_id, facilityId: r.facility_id, name: r.name,
    status: r.status as Department['status'],
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at), version: r.version,
  };
}
