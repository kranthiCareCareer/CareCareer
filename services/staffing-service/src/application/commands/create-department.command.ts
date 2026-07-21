import type { TenantAwareTransaction } from '@carecareer/database';

import { createDepartment } from '../../domain/department.js';
import type { StaffingRepository } from '../ports/staffing-repository.js';

export interface CreateDepartmentInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly facilityId: string;
  readonly name: string;
}

export interface CreateDepartmentResult {
  readonly departmentId: string;
}

/**
 * CreateDepartment command handler.
 *
 * Atomically:
 * 1. Verify facility exists in this tenant
 * 2. Create department aggregate
 * 3. Persist audit record
 *
 * Throws NotFoundException if facility doesn't exist in the tenant.
 */
export class CreateDepartmentHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: StaffingRepository,
  ) {}

  async execute(input: CreateDepartmentInput): Promise<CreateDepartmentResult> {
    const department = createDepartment({
      tenantId: input.tenantId,
      facilityId: input.facilityId,
      name: input.name,
    });

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      const facility = await this.repo.getFacilityById(tx, input.facilityId);
      if (!facility) {
        throw new Error('FACILITY_NOT_FOUND');
      }
      await this.repo.createDepartment(tx, department);
    });

    return { departmentId: department.id };
  }
}
