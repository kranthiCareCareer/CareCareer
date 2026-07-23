import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { rejectCredential } from '../../domain/credential.js';
import {
  CredentialNotFoundError,
  CredentialWorkerMismatchError,
  InvalidCredentialTransitionError,
} from '../../domain/errors.js';
import type { CredentialRepository } from '../ports/credential-repository.js';

export interface RejectCredentialInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly credentialId: string;
  readonly reason: string;
}

/**
 * RejectCredential command handler.
 * Transitions PENDING_VERIFICATION → REJECTED atomically with audit + outbox.
 */
export class RejectCredentialHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: CredentialRepository,
  ) {}

  async execute(input: RejectCredentialInput): Promise<{ credentialId: string; status: string }> {
    let resultStatus = '';

    await this.tenantDb.execute(input.tenantId, async (tx) => {
      const credential = await this.repo.getCredentialById(tx, input.credentialId);
      if (!credential) {
        throw new CredentialNotFoundError(input.credentialId);
      }
      if (credential.workerId !== input.workerId) {
        throw new CredentialWorkerMismatchError();
      }

      try {
        const updated = rejectCredential(credential);
        await this.repo.updateCredential(tx, updated);
        resultStatus = updated.status;
        await this.emitAudit(tx, input, updated.status);
        await this.emitOutbox(tx, input, credential.credentialType, updated.status);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('Cannot reject')) {
          throw new InvalidCredentialTransitionError(credential.status, 'REJECTED');
        }
        throw error;
      }
    });

    return { credentialId: input.credentialId, status: resultStatus };
  }

  private async emitAudit(
    tx: TransactionClient,
    input: RejectCredentialInput,
    newStatus: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'credential.rejected'},
        ${'credential'}, ${input.credentialId}::uuid,
        ${JSON.stringify({ status: newStatus, reason: input.reason })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutbox(
    tx: TransactionClient,
    input: RejectCredentialInput,
    credentialType: string,
    newStatus: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.credential.rejected.v1'},
        ${'credential'}, ${input.credentialId}::uuid,
        ${JSON.stringify({
          credentialId: input.credentialId,
          workerId: input.workerId,
          credentialType,
          status: newStatus,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
