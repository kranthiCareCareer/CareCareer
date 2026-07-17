import { TenantAwareTransaction } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import { createOrganization } from '../../domain/organization.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

export interface CreateOrganizationInput {
  readonly tenantId: string;
  readonly name: string;
  readonly actorId: string;
}

export async function createOrganizationCommand(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: CreateOrganizationInput,
): Promise<string> {
  const org = createOrganization({
    tenantId: input.tenantId,
    name: input.name,
    createdBy: input.actorId,
  });

  await tenantDb.execute(input.tenantId, async (tx) => {
    await repo.createOrganization(tx, org);

    await outboxWriter.write(tx, {
      eventType: 'carecareer.organization.created.v1',
      aggregateType: 'organization',
      aggregateId: org.id,
      aggregateVersion: org.version,
      data: { organizationId: org.id, tenantId: input.tenantId, name: org.name },
    });
  });

  return org.id;
}
