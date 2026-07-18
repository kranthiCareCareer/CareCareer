import { describe, expect, it, vi } from 'vitest';

import { runWithContext } from '@carecareer/request-context';

import { OutboxWriteError } from './errors.js';
import { EventEnvelopeBuilder } from './event-envelope-builder.js';
import { InMemoryEventTransport } from './in-memory-transport.js';
import { OutboxWriter } from './outbox-writer.js';

describe('EventEnvelopeBuilder', () => {
  const builder = new EventEnvelopeBuilder('test-service');

  it('should build envelope with explicit context', () => {
    const envelope = builder.build({
      eventType: 'carecareer.test.created.v1',
      aggregateType: 'test',
      aggregateId: 'agg-1',
      aggregateVersion: 1,
      data: { name: 'example' },
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
    });

    expect(envelope.eventType).toBe('carecareer.test.created.v1');
    expect(envelope.tenantId).toBe('tenant-1');
    expect(envelope.correlationId).toBe('corr-1');
    expect(envelope.source).toBe('test-service');
    expect(envelope.aggregateType).toBe('test');
    expect(envelope.aggregateId).toBe('agg-1');
    expect(envelope.aggregateVersion).toBe(1);
    expect(envelope.data).toEqual({ name: 'example' });
    expect(envelope.eventId).toBeDefined();
    expect(envelope.occurredAt).toBeDefined();
  });

  it('should derive context from request context', () => {
    let envelope: ReturnType<typeof builder.build> | undefined;

    runWithContext(
      {
        requestId: 'req-1',
        correlationId: 'corr-from-context',
        tenantId: 'tenant-from-context',
        actorId: 'user-1',
        actorType: 'user',
        startedAt: Date.now(),
      },
      () => {
        envelope = builder.build({
          eventType: 'carecareer.test.created.v1',
          aggregateType: 'test',
          aggregateId: 'agg-1',
          aggregateVersion: 1,
          data: {},
        });
      },
    );

    expect(envelope?.tenantId).toBe('tenant-from-context');
    expect(envelope?.correlationId).toBe('corr-from-context');
    expect(envelope?.actor?.type).toBe('user');
    expect(envelope?.actor?.id).toBe('user-1');
  });

  it('should fail without tenant context', () => {
    expect(() =>
      builder.build({
        eventType: 'carecareer.test.created.v1',
        aggregateType: 'test',
        aggregateId: 'agg-1',
        aggregateVersion: 1,
        data: {},
      }),
    ).toThrow('Cannot build event envelope without tenant context');
  });

  it('should set eventVersion to 1 by default', () => {
    const envelope = builder.build({
      eventType: 'carecareer.test.created.v1',
      aggregateType: 'test',
      aggregateId: 'agg-1',
      aggregateVersion: 1,
      data: {},
      tenantId: 'tenant-1',
    });

    expect(envelope.eventVersion).toBe(1);
  });
});

describe('OutboxWriter', () => {
  const writer = new OutboxWriter('test-service');

  it('should fail without tenant context', async () => {
    const mockTx = { $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([]) };

    await expect(
      writer.write(mockTx, {
        eventType: 'carecareer.test.created.v1',
        aggregateType: 'test',
        aggregateId: 'agg-1',
        aggregateVersion: 1,
        data: {},
      }),
    ).rejects.toThrow(OutboxWriteError);
  });

  it('should write outbox record within tenant context', async () => {
    const mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    await runWithContext(
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorType: 'user',
        startedAt: Date.now(),
      },
      async () => {
        const envelope = await writer.write(mockTx, {
          eventType: 'carecareer.test.created.v1',
          aggregateType: 'test',
          aggregateId: 'agg-1',
          aggregateVersion: 1,
          data: { name: 'test' },
        });

        expect(envelope.tenantId).toBe('tenant-1');
        expect(envelope.correlationId).toBe('corr-1');
        expect(envelope.eventType).toBe('carecareer.test.created.v1');
        expect(mockTx.$executeRaw).toHaveBeenCalledOnce();
      },
    );
  });

  it('should throw OutboxWriteError when database insert fails', async () => {
    const mockTx = {
      $executeRaw: vi.fn().mockRejectedValue(new Error('DB error')),
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    await runWithContext(
      {
        requestId: 'req-1',
        correlationId: 'corr-1',
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorType: 'user',
        startedAt: Date.now(),
      },
      async () => {
        await expect(
          writer.write(mockTx, {
            eventType: 'carecareer.test.created.v1',
            aggregateType: 'test',
            aggregateId: 'agg-1',
            aggregateVersion: 1,
            data: {},
          }),
        ).rejects.toThrow(OutboxWriteError);
      },
    );
  });
});

describe('InMemoryEventTransport', () => {
  it('should store published events', async () => {
    const transport = new InMemoryEventTransport();

    await transport.publish({
      eventId: 'e-1',
      eventType: 'test.event.v1',
      eventVersion: 1,
      tenantId: 't-1',
      aggregateType: 'test',
      aggregateId: 'a-1',
      aggregateVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: 'c-1',
      source: 'test',
      data: {},
    });

    expect(transport.publishedCount).toBe(1);
    expect(transport.getEventsByType('test.event.v1')).toHaveLength(1);
  });

  it('should fail when unhealthy', async () => {
    const transport = new InMemoryEventTransport();
    transport.setHealthy(false);

    await expect(
      transport.publish({
        eventId: 'e-1',
        eventType: 'test.event.v1',
        eventVersion: 1,
        tenantId: 't-1',
        aggregateType: 'test',
        aggregateId: 'a-1',
        aggregateVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: 'c-1',
        source: 'test',
        data: {},
      }),
    ).rejects.toThrow('Transport unhealthy');
  });

  it('should clear events', async () => {
    const transport = new InMemoryEventTransport();
    await transport.publish({
      eventId: 'e-1',
      eventType: 'x',
      eventVersion: 1,
      tenantId: 't',
      aggregateType: 'x',
      aggregateId: 'a',
      aggregateVersion: 1,
      occurredAt: '',
      correlationId: 'c',
      source: 's',
      data: {},
    });

    transport.clear();
    expect(transport.publishedCount).toBe(0);
  });
});
