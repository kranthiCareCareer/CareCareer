import type { IdempotencyRecord } from './idempotency-record.js';
import type { ClaimResult, IdempotencyStore } from './idempotency-store.js';

/**
 * In-memory idempotency store for unit testing.
 * Production uses PostgreSQL with SELECT ... FOR UPDATE SKIP LOCKED.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();
  private healthy = true;

  async claim(params: {
    tenantId: string;
    actorId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    expiresAt: Date;
    lockDurationMs: number;
  }): Promise<ClaimResult> {
    if (!this.healthy) {
      throw new Error('Store unavailable');
    }

    const key = this.buildKey(params.tenantId, params.operation, params.idempotencyKey);
    const existing = this.records.get(key);

    if (existing) {
      return { claimed: false, existing };
    }

    const now = new Date();
    const record: IdempotencyRecord = {
      id: `idem-${Date.now()}`,
      tenantId: params.tenantId,
      actorId: params.actorId,
      operation: params.operation,
      idempotencyKey: params.idempotencyKey,
      requestHash: params.requestHash,
      status: 'PROCESSING',
      responseStatus: null,
      responseBody: null,
      resourceType: null,
      resourceId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: params.expiresAt,
      lockedUntil: new Date(now.getTime() + params.lockDurationMs),
    };

    this.records.set(key, record);
    return { claimed: true, record };
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
    const key = this.buildKey(params.tenantId, params.operation, params.idempotencyKey);
    const record = this.records.get(key);
    if (!record) return;

    const updated: IdempotencyRecord = {
      ...record,
      status: 'COMPLETED',
      responseStatus: params.responseStatus,
      responseBody: params.responseBody,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      updatedAt: new Date(),
      lockedUntil: null,
    };
    this.records.set(key, updated);
  }

  async fail(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
    status: 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';
  }): Promise<void> {
    const key = this.buildKey(params.tenantId, params.operation, params.idempotencyKey);
    const record = this.records.get(key);
    if (!record) return;

    if (params.status === 'FAILED_RETRYABLE') {
      // Allow retry by removing the record
      this.records.delete(key);
    } else {
      const updated: IdempotencyRecord = {
        ...record,
        status: params.status,
        updatedAt: new Date(),
        lockedUntil: null,
      };
      this.records.set(key, updated);
    }
  }

  async find(params: {
    tenantId: string;
    operation: string;
    idempotencyKey: string;
  }): Promise<IdempotencyRecord | undefined> {
    const key = this.buildKey(params.tenantId, params.operation, params.idempotencyKey);
    return this.records.get(key);
  }

  // Test helpers
  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  clear(): void {
    this.records.clear();
  }

  get size(): number {
    return this.records.size;
  }

  private buildKey(tenantId: string, operation: string, idempotencyKey: string): string {
    return `${tenantId}:${operation}:${idempotencyKey}`;
  }
}
