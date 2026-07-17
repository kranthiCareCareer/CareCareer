import { AdministrativeDatabase } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';
import { IdempotencyService } from '@carecareer/idempotency';

import type { PlatformRepository } from '../ports/platform-repository.js';

import {
  provisionTenant,
  type ProvisionTenantInput,
  type ProvisionTenantResult,
} from './provision-tenant.command.js';

/**
 * Idempotent wrapper around tenant provisioning.
 *
 * Behavior:
 * - Same key + same payload → returns original result, no second execution
 * - Same key + different payload → throws IdempotencyConflictError (409)
 * - Concurrent duplicates → one executes, others receive the stored result
 */
export async function idempotentProvisionTenant(
  idempotencyService: IdempotencyService,
  adminDb: AdministrativeDatabase,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: ProvisionTenantInput,
): Promise<{ result: ProvisionTenantResult; status: number; fromCache: boolean }> {
  const idempotencyResult = await idempotencyService.execute(
    {
      tenantId: 'platform', // Platform-level operation (tenant doesn't exist yet)
      actorId: input.actorId,
      operation: 'POST:/v1/tenants',
      idempotencyKey: input.idempotencyKey,
      requestBody: {
        name: input.name,
        slug: input.slug,
        organizationName: input.organizationName,
      },
    },
    async () => {
      const result = await provisionTenant(adminDb, repo, outboxWriter, input);
      return {
        result,
        status: 201,
        resourceType: 'tenant',
        resourceId: result.tenantId,
      };
    },
  );

  return {
    result: idempotencyResult.result as ProvisionTenantResult,
    status: idempotencyResult.status,
    fromCache: idempotencyResult.fromCache,
  };
}
