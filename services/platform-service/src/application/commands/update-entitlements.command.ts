import { TenantAwareTransaction } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import type { EntitlementSet, ModuleKey } from '../../domain/entitlement.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

export interface UpdateEntitlementsInput {
  readonly tenantId: string;
  readonly modules: Partial<Record<ModuleKey, boolean>>;
  readonly actorId: string;
  readonly expectedVersion: number;
}

export async function updateEntitlementsCommand(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: UpdateEntitlementsInput,
): Promise<void> {
  await tenantDb.execute(input.tenantId, async (tx) => {
    const current = await repo.getEntitlements(tx, input.tenantId);
    const before = { ...current.modules };

    const updatedModules = { ...current.modules, ...input.modules };
    const newVersion = current.version + 1;

    const updated: EntitlementSet = {
      tenantId: input.tenantId,
      modules: updatedModules,
      version: newVersion,
      updatedAt: new Date(),
      updatedBy: input.actorId,
    };

    await repo.saveEntitlements(tx, updated);

    await outboxWriter.write(tx, {
      eventType: 'carecareer.entitlements.updated.v1',
      aggregateType: 'entitlements',
      aggregateId: input.tenantId,
      aggregateVersion: newVersion,
      data: {
        tenantId: input.tenantId,
        before,
        after: updatedModules,
      },
    });
  });
}
