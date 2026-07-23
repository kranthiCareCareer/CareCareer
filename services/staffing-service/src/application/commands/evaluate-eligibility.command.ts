import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import {
  evaluateEligibility,
  type EligibilityCheckpoint,
  type EligibilityResult,
} from '../../domain/eligibility.js';
import type { CredentialRepository } from '../ports/credential-repository.js';
import type { StaffingRepository } from '../ports/staffing-repository.js';

export interface EvaluateEligibilityInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly facilityId: string;
  readonly checkpoint: EligibilityCheckpoint;
}

/**
 * EvaluateEligibility command handler.
 *
 * Atomically within one TenantAwareTransaction:
 * 1. Load worker credentials
 * 2. Load facility credential requirements (for worker's role)
 * 3. Run deterministic eligibility evaluation
 * 4. Persist evaluation record (append-only)
 * 5. Persist outbox event
 */
export class EvaluateEligibilityHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly staffingRepo: StaffingRepository,
    private readonly credentialRepo: CredentialRepository,
  ) {}

  async execute(input: EvaluateEligibilityInput): Promise<EligibilityResult> {
    let result: EligibilityResult | undefined;

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      // Load worker to determine their role
      const worker = await this.staffingRepo.getWorkerById(tx, input.workerId);
      if (!worker) {
        throw new Error(`Worker not found: ${input.workerId}`);
      }

      // Load facility to verify it exists
      const facility = await this.staffingRepo.getFacilityById(tx, input.facilityId);
      if (!facility) {
        throw new Error(`Facility not found: ${input.facilityId}`);
      }

      // Load worker's credentials
      const credentials = await this.credentialRepo.getCredentialsByWorkerId(tx, input.workerId);

      // Load facility requirements for the worker's role
      const requirements = await this.staffingRepo.listCredentialRequirements(
        tx,
        input.facilityId,
        { role: worker.profession },
      );

      // Run deterministic evaluation
      const asOf = new Date();
      result = evaluateEligibility({
        workerCredentials: credentials,
        facilityRequirements: requirements,
        checkpoint: input.checkpoint,
        asOf,
      });

      // Persist evaluation record (append-only)
      await this.persistEvaluation(tx, input, result);
      await this.emitOutboxEvent(tx, input, result);
    });

    return result!;
  }

  private async persistEvaluation(
    tx: TransactionClient,
    input: EvaluateEligibilityInput,
    result: EligibilityResult,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.eligibility_evaluations (
        tenant_id, worker_id, facility_id, checkpoint,
        outcome, reasons, evaluated_at, evaluated_by, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.workerId}::uuid, ${input.facilityId}::uuid,
        ${result.checkpoint}, ${result.outcome},
        ${JSON.stringify(result.reasons)}::jsonb,
        ${result.evaluatedAt.toISOString()}::timestamptz,
        ${input.actorId},
        ${input.correlationId}
      )`;
  }

  private async emitOutboxEvent(
    tx: TransactionClient,
    input: EvaluateEligibilityInput,
    result: EligibilityResult,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.eligibility.evaluated.v1'},
        ${'worker'}, ${input.workerId}::uuid,
        ${JSON.stringify({
          workerId: input.workerId,
          facilityId: input.facilityId,
          tenantId: input.tenantId,
          checkpoint: result.checkpoint,
          outcome: result.outcome,
          reasonCount: result.reasons.length,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
