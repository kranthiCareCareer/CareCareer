import { describe, expect, it } from 'vitest';

import { runWithContext } from '@carecareer/request-context';

import { StandardErrorEnvelope } from './errors/standard-error-envelope.js';
import { HealthChecker, type HealthIndicator } from './health/health-checker.js';
import { LogContextEnricher } from './logging/log-context-enricher.js';
import { DEFAULT_REDACT_PATHS, Redactor } from './logging/redaction.js';
import {
  MetricsRegistry,
  PROHIBITED_LABELS,
  STANDARD_METRICS,
} from './metrics/metrics-registry.js';

describe('Redactor', () => {
  const redactor = new Redactor();

  it('should redact authorization header', () => {
    const result = redactor.redact({ authorization: 'Bearer secret-token', data: 'safe' });
    expect(result).toEqual({ authorization: '[REDACTED]', data: 'safe' });
  });

  it('should redact nested password fields', () => {
    const result = redactor.redact({
      user: { name: 'Alice', password: 'secret123' },
    });
    expect(result).toEqual({ user: { name: 'Alice', password: '[REDACTED]' } });
  });

  it('should redact token fields', () => {
    const result = redactor.redact({ accessToken: 'xxx', refreshToken: 'yyy', userId: 'safe' });
    expect(result).toEqual({
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      userId: 'safe',
    });
  });

  it('should redact SSN and financial fields', () => {
    const result = redactor.redact({ ssn: '123-45-6789', bankAccount: '999', name: 'Bob' });
    expect(result).toEqual({ ssn: '[REDACTED]', bankAccount: '[REDACTED]', name: 'Bob' });
  });

  it('should redact cookie and set-cookie', () => {
    const result = redactor.redact({ cookie: 'session=abc', data: 'ok' });
    expect(result).toEqual({ cookie: '[REDACTED]', data: 'ok' });
  });

  it('should redact health and compliance records', () => {
    const result = redactor.redact({ healthRecord: 'PHI data', drugTest: 'positive' });
    expect(result).toEqual({ healthRecord: '[REDACTED]', drugTest: '[REDACTED]' });
  });

  it('should handle arrays', () => {
    const result = redactor.redact([{ password: 'x' }, { name: 'safe' }]);
    expect(result).toEqual([{ password: '[REDACTED]' }, { name: 'safe' }]);
  });

  it('should handle null and primitives', () => {
    expect(redactor.redact(null)).toBeNull();
    expect(redactor.redact('hello')).toBe('hello');
    expect(redactor.redact(42)).toBe(42);
  });

  it('should not mutate the original object', () => {
    const original = { password: 'secret', name: 'test' };
    redactor.redact(original);
    expect(original.password).toBe('secret');
  });

  it('should protect against deep recursion', () => {
    const deep: Record<string, unknown> = {};
    let current = deep;
    for (let i = 0; i < 15; i++) {
      current['child'] = {};
      current = current['child'] as Record<string, unknown>;
    }
    current['password'] = 'secret';

    const result = redactor.redact(deep) as Record<string, unknown>;
    expect(result).toBeDefined(); // Should not stack overflow
  });

  it('should cover all expected sensitive field names', () => {
    expect(DEFAULT_REDACT_PATHS.length).toBeGreaterThan(20);
    expect(DEFAULT_REDACT_PATHS).toContain('authorization');
    expect(DEFAULT_REDACT_PATHS).toContain('ssn');
    expect(DEFAULT_REDACT_PATHS).toContain('bankaccount');
    expect(DEFAULT_REDACT_PATHS).toContain('healthrecord');
  });
});

describe('LogContextEnricher', () => {
  const enricher = new LogContextEnricher({
    service: 'staffing-service',
    version: '1.0.0',
    environment: 'test',
  });

  it('should include service metadata', () => {
    const ctx = enricher.enrich();
    expect(ctx.service).toBe('staffing-service');
    expect(ctx.version).toBe('1.0.0');
    expect(ctx.environment).toBe('test');
  });

  it('should include request context when available', () => {
    let ctx: ReturnType<typeof enricher.enrich> = enricher.enrich();
    runWithContext(
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorType: 'user',
        startedAt: Date.now(),
      },
      () => {
        ctx = enricher.enrich();
      },
    );

    expect(ctx.requestId).toBe('req-1');
    expect(ctx.correlationId).toBe('corr-1');
    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.actorId).toBe('user-1');
  });

  it('should handle missing request context gracefully', () => {
    const ctx = enricher.enrich();
    expect(ctx.requestId).toBeUndefined();
    expect(ctx.correlationId).toBeUndefined();
    expect(ctx.service).toBe('staffing-service');
  });
});

describe('StandardErrorEnvelope', () => {
  it('should build a standard error envelope', () => {
    const envelope = StandardErrorEnvelope.build({
      code: 'WORKER_NOT_ELIGIBLE',
      message: 'Worker is not eligible',
      correlationId: 'corr-1',
      requestId: 'req-1',
      details: [{ reason: 'CREDENTIAL_EXPIRED', credentialType: 'RN_LICENSE' }],
    });

    expect(envelope.error.code).toBe('WORKER_NOT_ELIGIBLE');
    expect(envelope.error.message).toBe('Worker is not eligible');
    expect(envelope.error.correlationId).toBe('corr-1');
    expect(envelope.error.timestamp).toBeDefined();
    expect(envelope.error.details).toHaveLength(1);
  });

  it('should build an internal error without exposing internals', () => {
    const envelope = StandardErrorEnvelope.internalError({
      correlationId: 'corr-1',
      requestId: 'req-1',
    });

    expect(envelope.error.code).toBe('INTERNAL_ERROR');
    expect(envelope.error.message).not.toContain('stack');
    expect(envelope.error.message).not.toContain('sql');
    expect(envelope.error.message).toContain('correlation ID');
  });
});

describe('HealthChecker', () => {
  it('should report liveness as healthy when running', async () => {
    const checker = new HealthChecker();
    const result = await checker.liveness();
    expect(result.status).toBe('healthy');
  });

  it('should report liveness as unhealthy when shutting down', async () => {
    const checker = new HealthChecker();
    checker.markShuttingDown();
    const result = await checker.liveness();
    expect(result.status).toBe('unhealthy');
  });

  it('should report readiness as healthy when all indicators pass', async () => {
    const checker = new HealthChecker();
    const dbIndicator: HealthIndicator = {
      name: 'postgresql',
      requiredForReadiness: true,
      check: async () => ({ status: 'healthy' }),
    };
    checker.registerIndicator(dbIndicator);

    const result = await checker.readiness();
    expect(result.status).toBe('healthy');
    expect(result.indicators['postgresql']?.status).toBe('healthy');
  });

  it('should report readiness as unhealthy when required indicator fails', async () => {
    const checker = new HealthChecker();
    const dbIndicator: HealthIndicator = {
      name: 'postgresql',
      requiredForReadiness: true,
      check: async () => ({ status: 'unhealthy', details: { error: 'connection_refused' } }),
    };
    checker.registerIndicator(dbIndicator);

    const result = await checker.readiness();
    expect(result.status).toBe('unhealthy');
  });

  it('should keep liveness healthy when PostgreSQL is unavailable', async () => {
    const checker = new HealthChecker();
    const dbIndicator: HealthIndicator = {
      name: 'postgresql',
      requiredForReadiness: true,
      check: async () => ({ status: 'unhealthy' }),
    };
    checker.registerIndicator(dbIndicator);

    // Liveness does not check indicators
    const liveness = await checker.liveness();
    expect(liveness.status).toBe('healthy');

    // But readiness fails
    const readiness = await checker.readiness();
    expect(readiness.status).toBe('unhealthy');
  });

  it('should handle indicator check throwing', async () => {
    const checker = new HealthChecker();
    const badIndicator: HealthIndicator = {
      name: 'broken',
      requiredForReadiness: true,
      check: async () => {
        throw new Error('connection timeout');
      },
    };
    checker.registerIndicator(badIndicator);

    const result = await checker.readiness();
    expect(result.status).toBe('unhealthy');
    expect(result.indicators['broken']?.status).toBe('unhealthy');
  });
});

describe('MetricsRegistry', () => {
  it('should register valid metrics', () => {
    const registry = new MetricsRegistry();
    registry.register(STANDARD_METRICS[0]!);
    expect(registry.getRegistered()).toHaveLength(1);
  });

  it('should reject metrics with prohibited high-cardinality labels', () => {
    const registry = new MetricsRegistry();

    expect(() =>
      registry.register({
        name: 'bad_metric',
        help: 'Should fail',
        type: 'counter',
        labels: ['tenant_id', 'method'],
      }),
    ).toThrow('prohibited high-cardinality label');
  });

  it('should reject worker_id as a label', () => {
    const registry = new MetricsRegistry();

    expect(() =>
      registry.register({
        name: 'bad_metric',
        help: 'Should fail',
        type: 'counter',
        labels: ['worker_id'],
      }),
    ).toThrow('prohibited');
  });

  it('should reject correlation_id as a label', () => {
    const registry = new MetricsRegistry();

    expect(() =>
      registry.register({
        name: 'bad_metric',
        help: 'Should fail',
        type: 'counter',
        labels: ['correlationId'],
      }),
    ).toThrow('prohibited');
  });

  it('should allow standard metrics without prohibited labels', () => {
    const registry = new MetricsRegistry();

    for (const metric of STANDARD_METRICS) {
      expect(() => registry.register(metric)).not.toThrow();
    }

    expect(registry.getRegistered()).toHaveLength(STANDARD_METRICS.length);
  });

  it('should cover all expected prohibited labels', () => {
    expect(PROHIBITED_LABELS.length).toBeGreaterThan(10);
    expect(PROHIBITED_LABELS).toContain('tenant_id');
    expect(PROHIBITED_LABELS).toContain('worker_id');
    expect(PROHIBITED_LABELS).toContain('facility_id');
    expect(PROHIBITED_LABELS).toContain('request_id');
    expect(PROHIBITED_LABELS).toContain('correlation_id');
  });
});
