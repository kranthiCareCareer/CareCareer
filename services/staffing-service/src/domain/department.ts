/**
 * Department domain entity.
 *
 * A department is a unit within a facility (e.g. ICU, ER, Med-Surg).
 * Departments are tenant-scoped and facility-scoped.
 */

export interface Department {
  readonly id: string;
  readonly tenantId: string;
  readonly facilityId: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CreateDepartmentInput {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly name: string;
}

/**
 * Create a new department entity.
 */
export function createDepartment(input: CreateDepartmentInput): Department {
  if (!input.name || input.name.trim() === '') {
    throw new Error('Department name is required');
  }

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    facilityId: input.facilityId,
    name: input.name.trim(),
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };
}
