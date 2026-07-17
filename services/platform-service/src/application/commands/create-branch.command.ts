import { TenantAwareTransaction } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import { createBranch } from '../../domain/organization.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

export interface CreateBranchInput {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly actorId: string;
}

export async function createBranchCommand(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: CreateBranchInput,
): Promise<string> {
  const branch = createBranch({
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    name: input.name,
    code: input.code,
    createdBy: input.actorId,
  });

  await tenantDb.execute(input.tenantId, async (tx) => {
    await repo.createBranch(tx, branch);

    await outboxWriter.write(tx, {
      eventType: 'carecareer.branch.created.v1',
      aggregateType: 'branch',
      aggregateId: branch.id,
      aggregateVersion: branch.version,
      data: {
        branchId: branch.id,
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        name: branch.name,
        code: branch.code,
      },
    });
  });

  return branch.id;
}
