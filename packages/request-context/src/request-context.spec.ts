import { describe, expect, it } from 'vitest';

import { RequestContext } from './request-context.js';
import { getContext, runWithContext } from './storage.js';
import { generateRequestId, validateCorrelationId } from './utils.js';

describe('RequestContext', () => {
  it('should create context with required fields', () => {
    const ctx = new RequestContext({
      requestId: 'req-1',
      correlationId: 'corr-1',
      startedAt: Date.now(),
    });

    expect(ctx.requestId).toBe('req-1');
    expect(ctx.correlationId).toBe('corr-1');
    expect(ctx.tenantId).toBeUndefined();
    expect(ctx.actorId).toBeUndefined();
  });

  it('should create enriched context with withTenant', () => {
    const ctx = new RequestContext({
      requestId: 'req-1',
      correlationId: 'corr-1',
      startedAt: Date.now(),
    });

    const enriched = ctx.withTenant('tenant-1', 'user-1', 'user');

    expect(enriched.tenantId).toBe('tenant-1');
    expect(enriched.actorId).toBe('user-1');
    expect(enriched.actorType).toBe('user');
    // Original is unchanged (immutable)
    expect(ctx.tenantId).toBeUndefined();
  });

  it('should calculate elapsed time', () => {
    const ctx = new RequestContext({
      requestId: 'req-1',
      correlationId: 'corr-1',
      startedAt: Date.now() - 100,
    });

    expect(ctx.elapsedMs).toBeGreaterThanOrEqual(100);
  });

  it('should produce log context', () => {
    const ctx = new RequestContext({
      requestId: 'req-1',
      correlationId: 'corr-1',
      tenantId: 'tenant-1',
      actorId: 'user-1',
      actorType: 'user',
      startedAt: Date.now(),
    });

    const log = ctx.toLogContext();

    expect(log.requestId).toBe('req-1');
    expect(log.correlationId).toBe('corr-1');
    expect(log.tenantId).toBe('tenant-1');
    expect(log.actorId).toBe('user-1');
  });
});

describe('AsyncLocalStorage context', () => {
  it('should propagate context through async operations', async () => {
    let capturedContext: ReturnType<typeof getContext>;

    await runWithContext(
      { requestId: 'req-async', correlationId: 'corr-async', startedAt: Date.now() },
      async () => {
        await Promise.resolve();
        capturedContext = getContext();
      },
    );

    expect(capturedContext!.requestId).toBe('req-async');
    expect(capturedContext!.correlationId).toBe('corr-async');
  });

  it('should return undefined outside context', () => {
    const ctx = getContext();
    expect(ctx).toBeUndefined();
  });

  it('should isolate between concurrent requests', async () => {
    const results: string[] = [];

    await Promise.all([
      runWithContext(
        { requestId: 'req-a', correlationId: 'corr-a', startedAt: Date.now() },
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push(getContext()!.requestId);
        },
      ),
      runWithContext(
        { requestId: 'req-b', correlationId: 'corr-b', startedAt: Date.now() },
        async () => {
          await new Promise((r) => setTimeout(r, 5));
          results.push(getContext()!.requestId);
        },
      ),
    ]);

    expect(results).toContain('req-a');
    expect(results).toContain('req-b');
  });
});

describe('validateCorrelationId', () => {
  it('should accept valid UUID', () => {
    const id = '019123ab-cdef-7890-abcd-ef1234567890';
    expect(validateCorrelationId(id)).toBe(id);
  });

  it('should reject null/undefined', () => {
    expect(validateCorrelationId(null)).toBeUndefined();
    expect(validateCorrelationId(undefined)).toBeUndefined();
  });

  it('should reject too-long values', () => {
    const long = 'a'.repeat(200);
    expect(validateCorrelationId(long)).toBeUndefined();
  });

  it('should reject non-printable characters', () => {
    expect(validateCorrelationId('test\x00value')).toBeUndefined();
  });

  it('should accept printable ASCII strings within length', () => {
    expect(validateCorrelationId('my-custom-trace-id-123')).toBe('my-custom-trace-id-123');
  });
});

describe('generateRequestId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
  });

  it('should produce valid UUID format', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
