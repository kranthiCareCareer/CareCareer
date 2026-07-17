import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AdministrativeDatabase,
  type PrismaLikeClient,
  type TransactionClient,
} from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';
import {
  IdempotencyConflictError,
  IdempotencyService,
  InMemoryIdempotencyStore,
} from '@carecareer/idempotency';

import { idempotentProvisionTenant } from '../application/commands/idempotent-provision-tenant.command.js';

import { PostgresPlatformRepository } from './postgres-platform-repository.js';

const MIGRATION_PATH = resolve('prisma', 'migrations', '001_initial_schema.sql');

describe('End-to-End Idempotency (Real PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let superClient: Client;
  let adminDb: AdministrativeDatabase;
  let repo: PostgresPlatformRepository;
  let outboxWriter: OutboxWriter;
  let idempotencyService: IdempotencyService;
  let idempotencyStore: InMemoryIdempotencyStore;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('idem_test')
      .withUsername('idem_admin')
      .withPassword('test_pw')
      .start();

    superClient = new Client({ connectionString: container.getConnectionUri() });
    await superClient.connect();

    const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8');
    await superClient.query(migrationSql);

    await superClient.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_service') THEN
          CREATE ROLE app_service NOINHERIT LOGIN PASSWORD 'app_pw';
        END IF;
      END $$;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service;
      REVOKE UPDATE, DELETE, TRUNCATE ON audit_records FROM app_service;
    `);

    const prismaLike = createPrismaLike(container.getConnectionUri());
    adminDb = new AdministrativeDatabase(prismaLike);
    repo = new PostgresPlatformRepository();
    outboxWriter = new OutboxWriter('platform-service');
    idempotencyStore = new InMemoryIdempotencyStore();
    idempotencyService = new IdempotencyService(idempotencyStore);
  });

  afterAll(async () => {
    await superClient.end();
    await container.stop();
  });

  beforeEach(async () => {
    await superClient.query('DELETE FROM audit_records');
    await superClient.query('DELETE FROM event_outbox');
    await superClient.query('DELETE FROM tenant_feature_configurations');
    await superClient.query('DELETE FROM tenant_entitlements');
    await superClient.query('DELETE FROM branches');
    await superClient.query('DELETE FROM organizations');
    await superClient.query('DELETE FROM tenants');
    idempotencyStore.clear();
  });

  it('should execute once and return the original result on replay (same key + same payload)', async () => {
    const input = {
      name: 'Idem Tenant',
      slug: 'idem-tenant',
      organizationName: 'Idem Org',
      actorId: 'admin-1',
      correlationId: 'corr-idem-1',
      idempotencyKey: 'idem-key-replay',
    };

    // First call — creates tenant
    const result1 = await idempotentProvisionTenant(
      idempotencyService,
      adminDb,
      repo,
      outboxWriter,
      input,
    );
    expect(result1.status).toBe(201);
    expect(result1.fromCache).toBe(false);
    expect(result1.result.tenantId).toBeDefined();

    // Second call — same key, same payload → returns cached result
    const result2 = await idempotentProvisionTenant(
      idempotencyService,
      adminDb,
      repo,
      outboxWriter,
      input,
    );
    expect(result2.status).toBe(201);
    expect(result2.fromCache).toBe(true);
    expect(result2.result.tenantId).toBe(result1.result.tenantId);

    // Verify: only ONE tenant was created
    const tenantCount = await superClient.query('SELECT count(*) FROM tenants');
    expect(parseInt(tenantCount.rows[0].count, 10)).toBe(1);

    // Verify: only ONE outbox event
    const outboxCount = await superClient.query('SELECT count(*) FROM event_outbox');
    expect(parseInt(outboxCount.rows[0].count, 10)).toBe(1);

    // Verify: only ONE audit record
    const auditCount = await superClient.query('SELECT count(*) FROM audit_records');
    expect(parseInt(auditCount.rows[0].count, 10)).toBe(1);
  });

  it('should return 409 IDEMPOTENCY_CONFLICT for same key with different payload', async () => {
    // First call succeeds
    await idempotentProvisionTenant(idempotencyService, adminDb, repo, outboxWriter, {
      name: 'Original Tenant',
      slug: 'original-slug',
      organizationName: 'Original Org',
      actorId: 'admin-1',
      correlationId: 'corr-conflict',
      idempotencyKey: 'idem-key-conflict',
    });

    // Second call with SAME key but DIFFERENT payload
    await expect(
      idempotentProvisionTenant(idempotencyService, adminDb, repo, outboxWriter, {
        name: 'DIFFERENT Tenant',
        slug: 'different-slug',
        organizationName: 'Different Org',
        actorId: 'admin-1',
        correlationId: 'corr-conflict-2',
        idempotencyKey: 'idem-key-conflict', // Same key!
      }),
    ).rejects.toThrow(IdempotencyConflictError);

    // Verify: still only ONE tenant (the original)
    const tenantCount = await superClient.query('SELECT count(*) FROM tenants');
    expect(parseInt(tenantCount.rows[0].count, 10)).toBe(1);

    // Verify: no additional audit or outbox records
    const outboxCount = await superClient.query('SELECT count(*) FROM event_outbox');
    expect(parseInt(outboxCount.rows[0].count, 10)).toBe(1);

    const auditCount = await superClient.query('SELECT count(*) FROM audit_records');
    expect(parseInt(auditCount.rows[0].count, 10)).toBe(1);
  });

  it('should not execute the handler when returning from cache', async () => {
    let executionCount = 0;

    const input = {
      name: 'Exec Count',
      slug: 'exec-count',
      organizationName: 'EC Org',
      actorId: 'admin-1',
      correlationId: 'corr-exec',
      idempotencyKey: 'idem-key-exec-count',
    };

    // Wrap in a counting layer
    const countingIdempotencyService = new IdempotencyService(idempotencyStore);

    // First execution
    await countingIdempotencyService.execute(
      {
        tenantId: 'platform',
        actorId: input.actorId,
        operation: 'POST:/v1/tenants',
        idempotencyKey: input.idempotencyKey,
        requestBody: {
          name: input.name,
          slug: input.slug,
          organizationName: input.organizationName,
        },
      },
      async () => {
        executionCount++;
        const result = await adminDb.execute(
          { actorId: input.actorId, reason: 'Provisioning', correlationId: input.correlationId },
          async () => ({ tenantId: 'fake-id', organizationId: 'fake-org' }),
        );
        return { result, status: 201 };
      },
    );

    // Second execution with same key + payload
    await countingIdempotencyService.execute(
      {
        tenantId: 'platform',
        actorId: input.actorId,
        operation: 'POST:/v1/tenants',
        idempotencyKey: input.idempotencyKey,
        requestBody: {
          name: input.name,
          slug: input.slug,
          organizationName: input.organizationName,
        },
      },
      async () => {
        executionCount++;
        return { result: { tenantId: 'should-not-run', organizationId: 'x' }, status: 201 };
      },
    );

    // Handler was called exactly ONCE
    expect(executionCount).toBe(1);
  });

  it('should handle concurrent duplicate requests — only one handler execution', async () => {
    let handlerExecutionCount = 0;

    const input = {
      name: 'Concurrent Tenant',
      slug: 'concurrent-tenant',
      organizationName: 'Conc Org',
      actorId: 'admin-1',
      correlationId: 'corr-concurrent',
      idempotencyKey: 'idem-key-concurrent',
    };

    // Launch two simultaneous requests with the same idempotency key
    const [result1, result2] = await Promise.allSettled([
      idempotencyService.execute(
        {
          tenantId: 'platform',
          actorId: input.actorId,
          operation: 'POST:/v1/tenants/concurrent',
          idempotencyKey: input.idempotencyKey,
          requestBody: { name: input.name, slug: input.slug, org: input.organizationName },
        },
        async () => {
          handlerExecutionCount++;
          // Simulate some work
          await new Promise((r) => setTimeout(r, 50));
          return { result: { tenantId: 'concurrent-id' }, status: 201 };
        },
      ),
      idempotencyService.execute(
        {
          tenantId: 'platform',
          actorId: input.actorId,
          operation: 'POST:/v1/tenants/concurrent',
          idempotencyKey: input.idempotencyKey,
          requestBody: { name: input.name, slug: input.slug, org: input.organizationName },
        },
        async () => {
          handlerExecutionCount++;
          await new Promise((r) => setTimeout(r, 50));
          return { result: { tenantId: 'concurrent-id-2' }, status: 201 };
        },
      ),
    ]);

    // Both should resolve (one from execution, one from cache or in-progress)
    const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Handler should execute at most once (in-memory store handles atomically)
    expect(handlerExecutionCount).toBe(1);

    // The first caller executes and gets the real result.
    // The second caller detects PROCESSING state and returns fromCache: true.
    // Since the handler hasn't completed yet when the second call arrives,
    // the cached responseBody is null (PROCESSING state).
    // This proves only one handler ran. In production (PostgreSQL), the second
    // caller would wait/retry. For in-memory, we verify only one execution.
    if (result1.status === 'fulfilled' && result2.status === 'fulfilled') {
      // One result is the real handler result, the other is the PROCESSING placeholder
      const real = result1.value.fromCache === false ? result1.value : result2.value;
      const cached = result1.value.fromCache === true ? result1.value : result2.value;

      expect(real.result).toEqual({ tenantId: 'concurrent-id' });
      expect(real.fromCache).toBe(false);
      expect(cached.fromCache).toBe(true);
      // The cached result has null body because the handler was still PROCESSING
      expect(cached.result).toBeNull();
    }
  });
});

// Helper
function createPrismaLike(connectionUri: string): PrismaLikeClient {
  return {
    async $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      const client = new Client({ connectionString: connectionUri });
      await client.connect();
      try {
        await client.query('BEGIN');
        const txClient: TransactionClient = {
          async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
            let query = '';
            for (let i = 0; i < strings.length; i++) {
              query += strings[i];
              if (i < values.length) {
                query += `$${String(i + 1)}`;
              }
            }
            const result = await client.query(query, values);
            return result.rowCount ?? 0;
          },
        };
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        await client.end();
      }
    },
  };
}
