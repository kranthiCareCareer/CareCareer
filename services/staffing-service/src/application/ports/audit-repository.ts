import type { TransactionClient } from '@carecareer/database';

export interface AuditEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorType: 'USER' | 'SERVICE' | 'SYSTEM';
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
  readonly correlationId?: string | undefined;
  readonly createdAt: Date;
}

/**
 * Audit repository port (append-only).
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface AuditRepository {
  createEntry(tx: TransactionClient, entry: AuditEntry): Promise<void>;
  listByResource(
    tx: TransactionClient,
    resourceType: string,
    resourceId: string,
  ): Promise<AuditEntry[]>;
  listByTenant(
    tx: TransactionClient,
    filters?: { action?: string | undefined; resourceType?: string | undefined; limit?: number },
  ): Promise<AuditEntry[]>;
}
