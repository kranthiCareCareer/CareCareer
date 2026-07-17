import { AdministrativeDatabase } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';
import { runWithContext } from '@carecareer/request-context';

import { createDefaultEntitlements } from '../../domain/entitlement.js';
import { createOrganization } from '../../domain/organization.js';
import { createTenant } from '../../domain/tenant.js';
import { writeAuditRecord } from '../../infrastructure/audit-writer.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

export interface ProvisionTenantInput {
  readonly name: string;
  readonly slug: string;
  readonly organizationName: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
}

export interface ProvisionTenantResult {
  readonly tenantId: string;
  readonly organizationId: string;
}

/**
 * Provision a new tenant.
 *
 * BOOTSTRAP PATH: Uses AdministrativeDatabase because the tenant does not
 * exist yet and cannot be scoped via RLS.
 *
 * Atomic: tenant + organization + entitlements + outbox event committed together.
 */
export async function provisionTenant(
  adminDb: AdministrativeDatabase,
  repo: PlatformRepository,
  outboxWriter: OutboxWriter,
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const tenant = createTenant({
    name: input.name,
    slug: input.slug,
    createdBy: input.actorId,
  });

  const organization = createOrganization({
    tenantId: tenant.id,
    name: input.organizationName,
    createdBy: input.actorId,
  });

  const entitlements = createDefaultEntitlements(tenant.id, input.actorId);

  const result = await adminDb.execute(
    {
      actorId: input.actorId,
      reason: 'Tenant provisioning — tenant does not exist yet',
      correlationId: input.correlationId,
    },
    async (tx) => {
      await repo.createTenant(tx, tenant);
      await repo.createOrganization(tx, organization);
      await repo.saveEntitlements(tx, entitlements);

      // Outbox event in same transaction — uses runWithContext to provide tenant context
      await runWithContext(
        {
          requestId: input.correlationId,
          correlationId: input.correlationId,
          tenantId: tenant.id,
          actorId: input.actorId,
          actorType: 'user',
          startedAt: Date.now(),
        },
        async () => {
          await outboxWriter.write(tx, {
            eventType: 'carecareer.tenant.provisioned.v1',
            aggregateType: 'tenant',
            aggregateId: tenant.id,
            aggregateVersion: tenant.version,
            data: {
              tenantId: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              organizationId: organization.id,
              organizationName: organization.name,
            },
          });
        },
      );

      // Audit record in same transaction (immutable, append-only)
      await writeAuditRecord(tx, {
        tenantId: tenant.id,
        actorId: input.actorId,
        actorType: 'user',
        action: 'platform.tenant.provision',
        resourceType: 'tenant',
        resourceId: tenant.id,
        afterState: { name: tenant.name, slug: tenant.slug, status: tenant.status },
        correlationId: input.correlationId,
        outcome: 'SUCCESS',
      });

      return { tenantId: tenant.id, organizationId: organization.id };
    },
  );

  return result;
}
