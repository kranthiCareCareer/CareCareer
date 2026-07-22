import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { changeWorkerStatus, type Worker, type WorkerStatus } from '../../domain/worker.js';
import type { StaffingRepository } from '../ports/staffing-repository.js';

export interface ChangeWorkerStatusInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly newStatus: WorkerStatus;
  readonly expectedVersion: number;
}

/**
 * ChangeWorkerStatus command handler.
 *
 * Atomically:
 * 1. Load worker and verify version
 * 2. Validate state transition
 * 3. Persist updated worker
 * 4. Audit the transition (NO PII)
 * 5. Emit outbox event (NO PII)
 */
export class ChangeWorkerStatusHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: StaffingRepository,
  ) {}

  async execute(input: ChangeWorkerStatusInput): Promise<Worker> {
    return this.tenantDb.execute(input.tenantId, async (tx) => {
      const worker = await this.repo.getWorkerById(tx, input.workerId);
      if (!worker) throw new Error('WORKER_NOT_FOUND');
      if (worker.version !== input.expectedVersion) throw new Error('VERSION_CONFLICT');

      const changed = changeWorkerStatus(worker, input.newStatus);
      await this.repo.updateWorker(tx, changed);

      await this.emitAudit(tx, worker, changed, input);
      await this.emitOutboxEvent(tx, changed, input);

      return changed;
    });
  }

  private async emitAudit(
    tx: TransactionClient,
    before: Worker,
    after: Worker,
    input: ChangeWorkerStatusInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        before_summary, after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId},
        ${'worker.status-changed'},
        ${'worker'}, ${input.workerId}::uuid,
        ${JSON.stringify({ status: before.status, version: before.version })}::jsonb,
        ${JSON.stringify({ status: after.status, version: after.version })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutboxEvent(
    tx: TransactionClient,
    worker: Worker,
    input: ChangeWorkerStatusInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.worker.status-changed.v1'},
        ${'worker'}, ${input.workerId}::uuid,
        ${JSON.stringify({
          workerId: worker.id,
          tenantId: worker.tenantId,
          previousStatus: input.newStatus === 'BLOCKED' ? 'ACTIVE' : undefined,
          newStatus: worker.status,
          version: worker.version,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
