import type { TransactionClient } from '@carecareer/database';

import { TenantInactiveError, TenantNotFoundError } from '../../domain/errors.js';
import type { TenantStatus } from '../../domain/tenant.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

/**
 * Guard that enforces tenant status before allowing protected mutations.
 *
 * Evaluation order for tenant-scoped mutations:
 * 1. Tenant exists
 * 2. Tenant context matches
 * 3. Tenant status permits operation
 * 4. (Entitlement check — caller responsibility)
 * 5. (Authorization check — caller responsibility)
 * 6. Execute mutation
 *
 * Statuses that permit business mutations: ACTIVE only.
 * SUSPENDED and DEACTIVATED are blocked.
 * PROVISIONING is blocked for business mutations (only lifecycle commands allowed).
 */
const MUTATION_PERMITTED_STATUSES: readonly TenantStatus[] = ['ACTIVE'];

/**
 * Verify that a tenant is in a state that permits business mutations.
 * Throws TenantNotFoundError or TenantInactiveError if not permitted.
 */
export async function requireActiveTenant(
  repo: PlatformRepository,
  tx: TransactionClient,
  tenantId: string,
): Promise<void> {
  const tenant = await repo.findTenantById(tx, tenantId);

  if (!tenant) {
    throw new TenantNotFoundError(tenantId);
  }

  if (!MUTATION_PERMITTED_STATUSES.includes(tenant.status)) {
    throw new TenantInactiveError(tenantId, tenant.status);
  }
}
