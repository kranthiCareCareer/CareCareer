import { TenantAwareTransaction } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import {
  InvalidStateTransitionError,
  TenantNotFoundError,
  VersionConflictError,
} from '../../domain/errors.js';
import { isValidTransition, type TenantStatus } from '../../domain/tenant.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

export interface TransitionTenantInput {
  readonly tenantId: string;
  readonly targetStatus: TenantStatus;
  readonly reason: string;
  readonly actorId: string;
  readonly expectedVersion: number;
}

/**
 * Transition a tenant through its lifecycle.
 * Validates the transition, applies optimistic concurrency, and emits event.
 */
export async function transitionTenant(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: TransitionTenantInput,
): Promise<void> {
  await tenantDb.execute(input.tenantId, async (tx) => {
    const tenant = await repo.findTenantById(tx, input.tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(input.tenantId);
    }

    if (tenant.version !== input.expectedVersion) {
      throw new VersionConflictError('tenant', input.tenantId);
    }

    if (!isValidTransition(tenant.status, input.targetStatus)) {
      throw new InvalidStateTransitionError(tenant.status, input.targetStatus);
    }

    const newVersion = tenant.version + 1;
    await repo.updateTenantStatus(tx, {
      tenantId: input.tenantId,
      status: input.targetStatus,
      version: newVersion,
      expectedVersion: input.expectedVersion,
      updatedBy: input.actorId,
      reason: input.reason,
    });

    const eventType = `carecareer.tenant.${input.targetStatus.toLowerCase()}.v1`;
    await outboxWriter.write(tx, {
      eventType,
      aggregateType: 'tenant',
      aggregateId: input.tenantId,
      aggregateVersion: newVersion,
      data: {
        tenantId: input.tenantId,
        previousStatus: tenant.status,
        newStatus: input.targetStatus,
        reason: input.reason,
      },
    });
  });
}
