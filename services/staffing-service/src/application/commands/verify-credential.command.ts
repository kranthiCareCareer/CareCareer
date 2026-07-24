import type { TenantAwareTransaction, TransactionClient } from '@carecareer/database';

import { verifyCredential, type Credential } from '../../domain/credential.js';
import {
  CredentialNotFoundError,
  CredentialWorkerMismatchError,
  InvalidCredentialTransitionError,
  VersionConflictError,
} from '../../domain/errors.js';
import {
  claimIdempotencyKey,
  completeIdempotency,
  hashRequest,
  IdempotencyConsistencyError,
} from '../../infrastructure/credential-idempotency.js';
import type { CredentialRepository } from '../ports/credential-repository.js';

export interface VerifyCredentialInput {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly workerId: string;
  readonly credentialId: string;
  readonly expectedVersion: number;
  readonly verifiedBy: string;
  readonly idempotencyKey: string;
}

/**
 * VerifyCredential command handler.
 *
 * Transitions a credential from PENDING_VERIFICATION -> VERIFIED.
 *
 * Atomically within one TenantAwareTransaction:
 * 1. Load credential (fail if not found or wrong status)
 * 2. Apply domain verification logic
 * 3. Persist updated credential
 * 4. Persist audit record (NO PII)
 * 5. Persist outbox event (NO PII)
 */
export class VerifyCredentialHandler {
  constructor(
    private readonly tenantDb: TenantAwareTransaction,
    private readonly repo: CredentialRepository,
  ) {}

  async execute(input: VerifyCredentialInput): Promise<{ credentialId: string }> {
    await this.tenantDb.execute(input.tenantId, async (tx) => {
      const reqHash = hashRequest({
        workerId: input.workerId,
        credentialId: input.credentialId,
        operation: 'verify',
        verifiedBy: input.verifiedBy,
        expectedVersion: input.expectedVersion,
      });

      const claim = await claimIdempotencyKey(
        tx,
        input.tenantId,
        'credential.verify',
        input.idempotencyKey,
        reqHash,
      );

      if (!claim.claimed && claim.replay) {
        return;
      }

      const token = claim.claimToken;
      if (!token) throw new IdempotencyConsistencyError();

      const existing = await this.repo.getCredentialById(tx, input.credentialId);
      if (!existing) {
        throw new CredentialNotFoundError(input.credentialId);
      }
      if (existing.workerId !== input.workerId) {
        throw new CredentialWorkerMismatchError();
      }
      if (existing.version !== input.expectedVersion) {
        throw new VersionConflictError('credential', input.credentialId);
      }

      let verifiedCredential: Credential;
      try {
        verifiedCredential = verifyCredential(existing, input.verifiedBy);
      } catch {
        throw new InvalidCredentialTransitionError(existing.status, 'VERIFIED');
      }

      await this.repo.updateCredential(tx, verifiedCredential);
      await this.emitAudit(tx, verifiedCredential, input);
      await this.emitOutboxEvent(tx, verifiedCredential, input);

      await completeIdempotency(
        tx,
        input.tenantId,
        'credential.verify',
        input.idempotencyKey,
        token,
        200,
        { credentialId: input.credentialId },
      );
    });

    return { credentialId: input.credentialId };
  }

  private async emitAudit(
    tx: TransactionClient,
    credential: Credential,
    input: VerifyCredentialInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_records (
        tenant_id, actor_id, action, aggregate_type, aggregate_id,
        after_summary, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${input.actorId}, ${'credential.verified'},
        ${'credential'}, ${credential.id}::uuid,
        ${JSON.stringify({
          credentialType: credential.credentialType,
          status: credential.status,
          workerId: credential.workerId,
          verifiedBy: credential.verifiedBy,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }

  private async emitOutboxEvent(
    tx: TransactionClient,
    credential: Credential,
    input: VerifyCredentialInput,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.event_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id,
        payload, correlation_id
      ) VALUES (
        ${input.tenantId}::uuid, ${'carecareer.credential.verified.v1'},
        ${'credential'}, ${credential.id}::uuid,
        ${JSON.stringify({
          credentialId: credential.id,
          workerId: credential.workerId,
          tenantId: credential.tenantId,
          credentialType: credential.credentialType,
          status: credential.status,
        })}::jsonb,
        ${input.correlationId}
      )`;
  }
}
