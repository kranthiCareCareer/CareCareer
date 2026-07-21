import type { TransactionClient } from '@carecareer/database';

import type { CredentialRequirement } from '../../domain/credential-requirement.js';
import type { Department } from '../../domain/department.js';
import type { Facility } from '../../domain/facility.js';

/**
 * Staffing repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface StaffingRepository {
  // Facilities
  createFacility(tx: TransactionClient, facility: Facility): Promise<void>;
  getFacilityById(tx: TransactionClient, facilityId: string): Promise<Facility | null>;
  listFacilities(tx: TransactionClient): Promise<Facility[]>;
  updateFacility(tx: TransactionClient, facility: Facility): Promise<void>;

  // Departments
  createDepartment(tx: TransactionClient, department: Department): Promise<void>;
  getDepartmentById(tx: TransactionClient, departmentId: string): Promise<Department | null>;
  listDepartmentsByFacility(tx: TransactionClient, facilityId: string): Promise<Department[]>;

  // Credential Requirements
  createCredentialRequirement(
    tx: TransactionClient,
    requirement: CredentialRequirement,
  ): Promise<void>;
  listCredentialRequirements(
    tx: TransactionClient,
    facilityId: string,
    filters?: { role?: string | undefined; departmentId?: string | undefined },
  ): Promise<CredentialRequirement[]>;
}
