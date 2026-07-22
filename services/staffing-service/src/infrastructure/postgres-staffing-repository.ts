import type { TransactionClient } from '@carecareer/database';

import type { StaffingRepository } from '../application/ports/staffing-repository.js';
import type { CredentialRequirement } from '../domain/credential-requirement.js';
import type { Department } from '../domain/department.js';
import type { Facility } from '../domain/facility.js';
import type { ExternalReference, Worker } from '../domain/worker.js';

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

  async updateDepartment(tx: TransactionClient, d: Department): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.departments SET
        name = ${d.name}, status = ${d.status},
        version = ${d.version}, updated_at = NOW()
      WHERE id = ${d.id}::uuid AND version = ${d.version - 1}`;
    if (count === 0) {
      throw new Error('VERSION_CONFLICT');
    }
  }

  async createCredentialRequirement(
    tx: TransactionClient,
    r: CredentialRequirement,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.credential_requirements (
        id, tenant_id, facility_id, department_id, role, credential_type,
        required, effective_from, created_at, updated_at
      ) VALUES (
        ${r.id}::uuid, ${r.tenantId}::uuid, ${r.facilityId}::uuid,
        ${r.departmentId ?? null}::uuid, ${r.role}, ${r.credentialType},
        ${r.required}, ${r.effectiveFrom.toISOString()}::timestamptz,
        ${r.createdAt.toISOString()}::timestamptz, ${r.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async listCredentialRequirements(
    tx: TransactionClient,
    facilityId: string,
    filters?: { role?: string | undefined; departmentId?: string | undefined },
  ): Promise<CredentialRequirement[]> {
    let rows: CredentialRequirementRow[];

    if (filters?.role && filters.departmentId) {
      rows = await tx.$queryRaw<CredentialRequirementRow>`
        SELECT * FROM staffing.credential_requirements
        WHERE facility_id = ${facilityId}::uuid
          AND role = ${filters.role}
          AND (department_id = ${filters.departmentId}::uuid OR department_id IS NULL)
          AND effective_from <= NOW()
        ORDER BY credential_type`;
    } else if (filters?.role) {
      rows = await tx.$queryRaw<CredentialRequirementRow>`
        SELECT * FROM staffing.credential_requirements
        WHERE facility_id = ${facilityId}::uuid
          AND role = ${filters.role}
          AND effective_from <= NOW()
        ORDER BY credential_type`;
    } else if (filters?.departmentId) {
      rows = await tx.$queryRaw<CredentialRequirementRow>`
        SELECT * FROM staffing.credential_requirements
        WHERE facility_id = ${facilityId}::uuid
          AND (department_id = ${filters.departmentId}::uuid OR department_id IS NULL)
          AND effective_from <= NOW()
        ORDER BY credential_type`;
    } else {
      rows = await tx.$queryRaw<CredentialRequirementRow>`
        SELECT * FROM staffing.credential_requirements
        WHERE facility_id = ${facilityId}::uuid
          AND effective_from <= NOW()
        ORDER BY credential_type`;
    }

    return rows.map(mapCredentialRequirement);
  }

  // ─── Workers ──────────────────────────────────────────────────────────────

  async createWorker(tx: TransactionClient, w: Worker): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.workers (
        id, tenant_id, first_name, last_name, email, phone, status, profession,
        specialty, home_latitude, home_longitude, home_city, home_state, home_zip,
        version, created_at, updated_at
      ) VALUES (
        ${w.id}::uuid, ${w.tenantId}::uuid, ${w.firstName}, ${w.lastName},
        ${w.email}, ${w.phone ?? null}, ${w.status}, ${w.profession},
        ${w.specialty ?? null}, ${w.homeLatitude ?? null}::decimal,
        ${w.homeLongitude ?? null}::decimal, ${w.homeCity ?? null},
        ${w.homeState ?? null}, ${w.homeZip ?? null},
        ${w.version}, ${w.createdAt.toISOString()}::timestamptz,
        ${w.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getWorkerById(tx: TransactionClient, workerId: string): Promise<Worker | null> {
    const rows = await tx.$queryRaw<WorkerRow>`
      SELECT * FROM staffing.workers WHERE id = ${workerId}::uuid`;
    if (rows.length === 0) return null;
    return mapWorker(rows[0]!);
  }

  async updateWorker(tx: TransactionClient, w: Worker): Promise<void> {
    const count = await tx.$executeRaw`
      UPDATE staffing.workers SET
        first_name = ${w.firstName}, last_name = ${w.lastName},
        phone = ${w.phone ?? null}, status = ${w.status},
        specialty = ${w.specialty ?? null},
        home_latitude = ${w.homeLatitude ?? null}::decimal,
        home_longitude = ${w.homeLongitude ?? null}::decimal,
        home_city = ${w.homeCity ?? null}, home_state = ${w.homeState ?? null},
        home_zip = ${w.homeZip ?? null},
        version = ${w.version}, updated_at = NOW()
      WHERE id = ${w.id}::uuid AND version = ${w.version - 1}`;
    if (count === 0) {
      throw new Error('VERSION_CONFLICT');
    }
  }

  async listWorkers(
    tx: TransactionClient,
    filters?: { status?: string | undefined },
  ): Promise<Worker[]> {
    let rows: WorkerRow[];
    if (filters?.status) {
      rows = await tx.$queryRaw<WorkerRow>`
        SELECT * FROM staffing.workers WHERE status = ${filters.status} ORDER BY last_name, first_name`;
    } else {
      rows = await tx.$queryRaw<WorkerRow>`
        SELECT * FROM staffing.workers ORDER BY last_name, first_name`;
    }
    return rows.map(mapWorker);
  }

  // ─── External References ──────────────────────────────────────────────────

  async createExternalReference(tx: TransactionClient, ref: ExternalReference): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.external_references (id, tenant_id, worker_id, system_name, external_id, created_at)
      VALUES (${ref.id}::uuid, ${ref.tenantId}::uuid, ${ref.workerId}::uuid,
        ${ref.systemName}, ${ref.externalId}, ${ref.createdAt.toISOString()}::timestamptz)`;
  }

  async getExternalReferences(tx: TransactionClient, workerId: string): Promise<ExternalReference[]> {
    const rows = await tx.$queryRaw<ExternalReferenceRow>`
      SELECT * FROM staffing.external_references WHERE worker_id = ${workerId}::uuid`;
    return rows.map(mapExternalReference);
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

interface CredentialRequirementRow {
  id: string; tenant_id: string; facility_id: string; department_id: string | null;
  role: string; credential_type: string; required: boolean;
  effective_from: string; created_at: string; updated_at: string;
}

function mapCredentialRequirement(r: CredentialRequirementRow): CredentialRequirement {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    facilityId: r.facility_id,
    departmentId: r.department_id ?? undefined,
    role: r.role as CredentialRequirement['role'],
    credentialType: r.credential_type,
    required: r.required,
    effectiveFrom: new Date(r.effective_from),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

interface WorkerRow {
  id: string; tenant_id: string; first_name: string; last_name: string;
  email: string; phone: string | null; status: string; profession: string;
  specialty: string | null; home_latitude: number | null; home_longitude: number | null;
  home_city: string | null; home_state: string | null; home_zip: string | null;
  created_at: string; updated_at: string; version: number;
}

interface ExternalReferenceRow {
  id: string; tenant_id: string; worker_id: string;
  system_name: string; external_id: string; created_at: string;
}

function mapWorker(r: WorkerRow): Worker {
  return {
    id: r.id, tenantId: r.tenant_id, firstName: r.first_name, lastName: r.last_name,
    email: r.email, phone: r.phone ?? undefined, status: r.status as Worker['status'],
    profession: r.profession as Worker['profession'],
    specialty: r.specialty ?? undefined,
    homeLatitude: r.home_latitude ?? undefined, homeLongitude: r.home_longitude ?? undefined,
    homeCity: r.home_city ?? undefined, homeState: r.home_state ?? undefined,
    homeZip: r.home_zip ?? undefined,
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at), version: r.version,
  };
}

function mapExternalReference(r: ExternalReferenceRow): ExternalReference {
  return {
    id: r.id, tenantId: r.tenant_id, workerId: r.worker_id,
    systemName: r.system_name, externalId: r.external_id,
    createdAt: new Date(r.created_at),
  };
}
