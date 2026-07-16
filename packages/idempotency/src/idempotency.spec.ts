import { describe, expect, it, vi } from 'vitest';

import { IdempotencyConflictError, IdempotencyStorageError } from './errors.js';
import { IdempotencyService } from './idempotency-service.js';
import { InMemoryIdempotencyStore } from './in-memory-store.js';
import { OperationScope } from './operation-scope.js';
import { RequestHasher } from './request-hasher.js';

describe('RequestHasher', () => {
  it('should produce deterministic hashes', () => {
    const hash1 = RequestHasher.hash({ name: 'test', value: 42 });
    const hash2 = RequestHasher.hash({ name: 'test', value: 42 });
    expect(hash1).toBe(hash2);
  });

  it('should differ for different payloads', () => {
    const hash1 = RequestHasher.hash({ name: 'test' });
    const hash2 = RequestHasher.hash({ name: 'other' });
    expect(hash1).not.toBe(hash2);
  });

  it('should exclude sensitive fields', () => {
    const hash1 = RequestHasher.hash({ name: 'test' });
    const hash2 = RequestHasher.hash({ name: 'test', password: 'secret123' });
    expect(hash1).toBe(hash2);
  });

  it('should exclude authorization-related fields', () => {
    const hash1 = RequestHasher.hash({ data: 'value' });
    const hash2 = RequestHasher.hash({ data: 'value', authorization: 'Bearer xxx', token: 'yyy' });
    expect(hash1).toBe(hash2);
  });

  it('should exclude SSN and financial fields', () => {
    const hash1 = RequestHasher.hash({ name: 'worker' });
    const hash2 = RequestHasher.hash({ name: 'worker', ssn: '123-45-6789', bankAccount: '999' });
    expect(hash1).toBe(hash2);
  });

  it('should be order-independent for object keys', () => {
    const hash1 = RequestHasher.hash({ b: 2, a: 1 });
    const hash2 = RequestHasher.hash({ a: 1, b: 2 });
    expect(hash1).toBe(hash2);
  });

  it('should handle nested objects', () => {
    const hash1 = RequestHasher.hash({ outer: { inner: 'value' } });
    const hash2 = RequestHasher.hash({ outer: { inner: 'different' } });
    expect(hash1).not.toBe(hash2);
  });

  it('should handle null and undefined', () => {
    const hash1 = RequestHasher.hash(null);
    const hash2 = RequestHasher.hash(undefined);
    expect(hash1).toBe(hash2);
  });
});

describe('OperationScope', () => {
  it('should build from HTTP request', () => {
    const scope = OperationScope.fromRequest('POST', '/v1/shifts');
    expect(scope).toBe('POST:/v1/shifts');
  });

  it('should uppercase the method', () => {
    const scope = OperationScope.fromRequest('post', '/v1/shifts');
    expect(scope).toBe('POST:/v1/shifts');
  });

  it('should build custom scopes', () => {
    const scope = OperationScope.custom('migration', 'import-workers');
    expect(scope).toBe('migration:import-workers');
  });
});

describe('IdempotencyService', () => {
  const baseParams = {
    tenantId: 'tenant-1',
    actorId: 'user-1',
    operation: 'POST:/v1/shifts',
    idempotencyKey: 'key-1',
    requestBody: { facilityId: 'fac-1', role: 'RN' },
  };

  it('should execute handler on first call', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: { id: 'shift-1' }, status: 201 });

    const result = await service.execute(baseParams, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(result.result).toEqual({ id: 'shift-1' });
    expect(result.status).toBe(201);
    expect(result.fromCache).toBe(false);
  });

  it('should return cached result on exact retry', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: { id: 'shift-1' }, status: 201 });

    await service.execute(baseParams, handler);
    const result = await service.execute(baseParams, handler);

    expect(handler).toHaveBeenCalledOnce(); // NOT called twice
    expect(result.result).toEqual({ id: 'shift-1' });
    expect(result.status).toBe(201);
    expect(result.fromCache).toBe(true);
  });

  it('should throw IDEMPOTENCY_CONFLICT on same key with different payload', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: { id: 'shift-1' }, status: 201 });

    await service.execute(baseParams, handler);

    await expect(
      service.execute(
        { ...baseParams, requestBody: { facilityId: 'fac-DIFFERENT', role: 'CNA' } },
        handler,
      ),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('should scope keys by tenant — different tenants can use same key', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: { id: 'shift-1' }, status: 201 });

    await service.execute(baseParams, handler);
    const result = await service.execute({ ...baseParams, tenantId: 'tenant-2' }, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.fromCache).toBe(false);
  });

  it('should scope keys by operation', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: { id: '1' }, status: 201 });

    await service.execute(baseParams, handler);
    const result = await service.execute({ ...baseParams, operation: 'POST:/v1/other' }, handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.fromCache).toBe(false);
  });

  it('should allow retry after retryable failure', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    let callCount = 0;
    const handler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('transient failure');
      return { result: { id: 'shift-1' }, status: 201 };
    });

    await expect(service.execute(baseParams, handler)).rejects.toThrow('transient failure');

    // Second call should succeed (retryable failure was cleared)
    const result = await service.execute(baseParams, handler);
    expect(result.result).toEqual({ id: 'shift-1' });
    expect(result.fromCache).toBe(false);
  });

  it('should fail closed when storage is unavailable', async () => {
    const store = new InMemoryIdempotencyStore();
    store.setHealthy(false);
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: {}, status: 201 });

    await expect(service.execute(baseParams, handler)).rejects.toThrow(IdempotencyStorageError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not execute handler when returning cached result', async () => {
    const store = new InMemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const handler = vi.fn().mockResolvedValue({ result: { id: 'x' }, status: 201 });

    await service.execute(baseParams, handler);
    await service.execute(baseParams, handler);
    await service.execute(baseParams, handler);

    expect(handler).toHaveBeenCalledOnce();
  });
});
