import { Client } from 'pg';

import type { IdempotencyRecord, IdempotencyStore, ClaimResult } from '@carecareer/idempotency';

/**
 * PostgreSQL-backed idempotency store for integration testing.
 * Uses SELECT ... FOR UPDATE to atomically claim keys.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  private readonly connectionUri: string;

  constructor(connectionUri: string) {
    this.connectionUri = connectionUri;
  }

  async claim(params: {
    tenantId: string;
    actorId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    expiresAt: Date;
    lockDurationMs: number;
  }): Promise<ClaimResult> {
    const client = new Client({ connectionString: this.connectionUri });
    await client.connect();

    try {
      // Check if already exists
      const existing = await client.query(
        'SELECT * FROM idempotency_keys WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3',
        [params.tenantId, params.operation, params.idempotencyKey],
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return {
          claimed: false,
          existing: this.mapRow(row),
        };
      }

      // Claim atomically via INSERT (unique constraint prevents duplicates)
      const now = new Date();
      await client.query(
        `INSERT INTO idempotency_keys (tenant_id, operation, idempotency_key, request_hash, status, created_at, updated_at, expires_at, locked_until)
         VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $5, $6, $7)`,
        [
          params.tenantId,
          params.operation,
          params.idempotencyKey,
          params.requestHash,
          now.toISOString(),
          params.expiresAt.toISOString(),
          new Date(now.getTime() + params.lockDurationMs).toISOString(),
        ],
      );

      const inserted = await client.query(
        'SELECT * FROM idempotency_keys WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3',
        [params.tenantId, params.operation, params.idempotencyKey],
      );

      return { claimed: true, record: this.mapRow(inserted.rows[0]) };
    } catch (error: unknown) {
      // Unique constraint violation = concurrent claim
      if (String(error).includes('duplicate key') || String(error).includes('unique constraint')) {
        const existing = await client.query(
          'SELECT * FROM idempotency_keys WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3',
          [params.tenantId, params.operation, params.idempotencyKey],
        );
        if (existing.rows.length > 0) {
          return { claimed: false, existing: this.mapRow(existing.rows[0]) };
        }
      }
      throw error;
    } finally {
      await client.end();
    }
  }

  async complete(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
    responseStatus: number;
    responseBody: unknown;
    resourceType?: string;
    resourceId?: string;
  }): Promise<void> {
    const client = new Client({ connectionString: this.connectionUri });
    await client.connect();
    try {
      // Store responseBody as proper JSONB (parameterized, not double-stringified)
      const bodyJson =
        typeof params.responseBody === 'string'
          ? params.responseBody
          : JSON.stringify(params.responseBody);
      await client.query(
        `UPDATE idempotency_keys SET status = 'COMPLETED', response_status = $1, response_body = $2::jsonb, updated_at = NOW(), locked_until = NULL
         WHERE tenant_id = $3 AND operation = $4 AND idempotency_key = $5`,
        [params.responseStatus, bodyJson, params.tenantId, params.operation, params.idempotencyKey],
      );
    } finally {
      await client.end();
    }
  }

  async fail(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
    status: 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';
  }): Promise<void> {
    const client = new Client({ connectionString: this.connectionUri });
    await client.connect();
    try {
      if (params.status === 'FAILED_RETRYABLE') {
        await client.query(
          'DELETE FROM idempotency_keys WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3',
          [params.tenantId, params.operation, params.idempotencyKey],
        );
      } else {
        await client.query(
          `UPDATE idempotency_keys SET status = $1, updated_at = NOW(), locked_until = NULL
           WHERE tenant_id = $2 AND operation = $3 AND idempotency_key = $4`,
          [params.status, params.tenantId, params.operation, params.idempotencyKey],
        );
      }
    } finally {
      await client.end();
    }
  }

  async find(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | undefined> {
    const client = new Client({ connectionString: this.connectionUri });
    await client.connect();
    try {
      const result = await client.query(
        'SELECT * FROM idempotency_keys WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3',
        [params.tenantId, params.operation, params.idempotencyKey],
      );
      if (result.rows.length === 0) return undefined;
      return this.mapRow(result.rows[0]);
    } finally {
      await client.end();
    }
  }

  private mapRow(row: Record<string, unknown>): IdempotencyRecord {
    // pg returns JSONB as parsed objects, but handle string case defensively
    let responseBody = row['response_body'] ?? null;
    if (typeof responseBody === 'string') {
      try {
        responseBody = JSON.parse(responseBody);
      } catch {
        // Leave as string if not valid JSON
      }
    }

    return {
      id: String(row['id'] ?? ''),
      tenantId: String(row['tenant_id'] ?? ''),
      actorId: String(row['actor_id'] ?? ''),
      operation: String(row['operation'] ?? ''),
      idempotencyKey: String(row['idempotency_key'] ?? ''),
      requestHash: String(row['request_hash'] ?? ''),
      status: String(row['status'] ?? 'PROCESSING') as
        | 'PROCESSING'
        | 'COMPLETED'
        | 'FAILED_RETRYABLE'
        | 'FAILED_TERMINAL',
      responseStatus: row['response_status'] ? Number(row['response_status']) : null,
      responseBody,
      resourceType: row['resource_type'] ? String(row['resource_type']) : null,
      resourceId: row['resource_id'] ? String(row['resource_id']) : null,
      createdAt: new Date(String(row['created_at'])),
      updatedAt: new Date(String(row['updated_at'])),
      expiresAt: new Date(String(row['expires_at'])),
      lockedUntil: row['locked_until'] ? new Date(String(row['locked_until'])) : null,
    };
  }
}
