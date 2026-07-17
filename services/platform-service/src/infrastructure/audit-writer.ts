import type { TransactionClient } from '@carecareer/database';

/**
 * Writes immutable audit records within the same transaction as domain changes.
 * Audit records cannot be updated or deleted by the application role.
 */
export interface AuditEntry {
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorType: 'user' | 'service' | 'system';
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly beforeState?: unknown;
  readonly afterState?: unknown;
  readonly reason?: string;
  readonly correlationId: string;
  readonly requestId?: string;
  readonly outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
}

/**
 * Write an audit record within the same transaction.
 * MUST be called in the same transaction as domain + outbox writes.
 */
export async function writeAuditRecord(tx: TransactionClient, entry: AuditEntry): Promise<void> {
  const beforeJson = entry.beforeState ? JSON.stringify(entry.beforeState) : null;
  const afterJson = entry.afterState ? JSON.stringify(entry.afterState) : null;

  await tx.$executeRaw`
    INSERT INTO audit_records (
      tenant_id, actor_id, actor_type, action, resource_type, resource_id,
      before_state, after_state, reason, correlation_id, request_id, outcome
    ) VALUES (
      ${entry.tenantId}::uuid, ${entry.actorId}, ${entry.actorType},
      ${entry.action}, ${entry.resourceType}, ${entry.resourceId},
      ${beforeJson}::jsonb, ${afterJson}::jsonb, ${entry.reason ?? null},
      ${entry.correlationId}, ${entry.requestId ?? null}, ${entry.outcome}
    )
  `;
}
