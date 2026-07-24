import type { TransactionClient } from '@carecareer/database';

import type { AuditEntry, AuditRepository } from '../application/ports/audit-repository.js';

/**
 * PostgreSQL implementation of the AuditRepository port.
 * Append-only. All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresAuditRepository implements AuditRepository {
  async createEntry(tx: TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.audit_log (
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, details, correlation_id, created_at
      ) VALUES (
        ${entry.id}::uuid, ${entry.tenantId}::uuid,
        ${entry.actorId}, ${entry.actorType}, ${entry.action},
        ${entry.resourceType}, ${entry.resourceId},
        ${JSON.stringify(entry.details)}::jsonb,
        ${entry.correlationId ?? null},
        ${entry.createdAt.toISOString()}::timestamptz
      )`;
  }

  async listByResource(
    tx: TransactionClient,
    resourceType: string,
    resourceId: string,
  ): Promise<AuditEntry[]> {
    const rows = await tx.$queryRaw<AuditRow>`
      SELECT * FROM staffing.audit_log
      WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
      ORDER BY created_at DESC`;
    return rows.map(mapAudit);
  }

  async listByTenant(
    tx: TransactionClient,
    filters?: { action?: string | undefined; resourceType?: string | undefined; limit?: number },
  ): Promise<AuditEntry[]> {
    const limit = filters?.limit ?? 100;
    if (filters?.action && filters.resourceType) {
      const rows = await tx.$queryRaw<AuditRow>`
        SELECT * FROM staffing.audit_log
        WHERE action = ${filters.action} AND resource_type = ${filters.resourceType}
        ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map(mapAudit);
    }
    if (filters?.action) {
      const rows = await tx.$queryRaw<AuditRow>`
        SELECT * FROM staffing.audit_log
        WHERE action = ${filters.action}
        ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map(mapAudit);
    }
    if (filters?.resourceType) {
      const rows = await tx.$queryRaw<AuditRow>`
        SELECT * FROM staffing.audit_log
        WHERE resource_type = ${filters.resourceType}
        ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map(mapAudit);
    }
    const rows = await tx.$queryRaw<AuditRow>`
      SELECT * FROM staffing.audit_log
      ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map(mapAudit);
  }
}

interface AuditRow {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  correlation_id: string | null;
  created_at: string;
}

function mapAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    actorId: r.actor_id,
    actorType: r.actor_type as AuditEntry['actorType'],
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    details: r.details ?? {},
    correlationId: r.correlation_id ?? undefined,
    createdAt: new Date(r.created_at),
  };
}
