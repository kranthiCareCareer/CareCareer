import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { createWorker, type Worker, ExternalReference } from '../../domain/worker.js';
import type { StaffingRepository } from '../ports/staffing-repository.js';

export interface CreateWorkerInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly userId?: string | undefined;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string | undefined;
  readonly profession: 'RN' | 'LPN' | 'CNA' | 'RT' | 'ALLIED';
  readonly specialty?: string | undefined;
  readonly homeLatitude?: number | undefined;
  readonly homeLongitude?: number | undefined;
  readonly homeCity?: string | undefined;
  readonly homeState?: string | undefined;
  readonly homeZip?: string | undefined;
  readonly externalReferences?: Array<{ systemName: string; externalId: string }> | undefined;
}

/**
 * CreateWorker command handler.
 *
 * Atomically within one TenantAwareTransaction:
 * 1. Create worker aggregate
 * 2. Create external references (if provided)
 * 3. Persist audit record (NO PII in payload)
 * 4. Persist outbox event (NO PII in payload)
 */
export class CreateWorkerHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: StaffingRepository,
  ) {}

  async execute(input: CreateWorkerInput): Promise<{ workerId: string }> {
    const worker = createWorker(input);

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      await this.repo.createWorker(tx, worker);

      if (input.externalReferences) {
        for (const ref of input.externalReferences) {
          await this.repo.createExternalReference(tx, {
            id: crypto.randomUUID(),
            tenantId: input.tenantId,
            workerId: worker.id,
            systemName: ref.systemName as ExternalReference['systemName'],
            externalId: ref.externalId,
            createdAt: new Date(),
          });
        }
      }

      await this.emitAudit(tx, worker, input);
      await this.emitOutboxEvent(tx, worker, input);
    });

    return { workerId: worker.id };
  }

  private async emitAudit(
    tx: TransactionClient,
    worker: Worker,
    input: CreateWorkerInput,
  ): Promise<void> {
    // NO PII in audit payload — only profession, status, role metadata
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'worker.created'},
        ${'worker'}, ${worker.id}::uuid,
        ${JSON.stringify({
          profession: worker.profession,
          status: worker.status,
          hasUserId: !!worker.userId,
          externalRefCount: input.externalReferences?.length ?? 0,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutboxEvent(
    tx: TransactionClient,
    worker: Worker,
    input: CreateWorkerInput,
  ): Promise<void> {
    // NO PII in outbox payload — only IDs and metadata
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.worker.created.v1'},
        ${'worker'}, ${worker.id}::uuid,
        ${JSON.stringify({
          workerId: worker.id,
          tenantId: worker.tenantId,
          profession: worker.profession,
          status: worker.status,
          hasUserId: !!worker.userId,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
