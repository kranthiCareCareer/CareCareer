import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AdministrativeDatabase } from '@carecareer/database';
import { OutboxWriter } from '@carecareer/events';

import { provisionTenant } from '../application/commands/provision-tenant.command.js';

import { PostgresPlatformRepository } from './postgres-platform-repository.js';

// Migration path relative to service root (vitest runs from service directory)
const MIGRATION_PATH = resolve('prisma', 'migrations', '001_initial_schema.sql');

describe('Platform Service Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let superClient: Client;
  let adminDb: AdministrativeDatabase;
  let repo: PostgresPlatformRepository;
  let outboxWriter: OutboxWriter;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('platform_test')
      .withUsername('platform_admin')
      .withPassword('test_password')
      .start();

    superClient = new Client({ connectionString: container.getConnectionUri() });
    await superClient.connect();

    // Apply migration
    const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8');
    await superClient.query(migrationSql);

    // Create app role for RLS testing
    await superClient.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_service') THEN
          CREATE ROLE app_service NOINHERIT LOGIN PASSWORD 'app_pw';
        END IF;
      END $$;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service;
    `);

    // Set up administrative database using superuser connection
    const prismaLike = createPrismaLike(container.getConnectionUri());
    adminDb = new AdministrativeDatabase(prismaLike);
    repo = new PostgresPlatformRepository();
    outboxWriter = new OutboxWriter('platform-service');
  });

  afterAll(async () => {
    await superClient.end();
    await container.stop();
  });

  beforeEach(async () => {
    await superClient.query('DELETE FROM event_outbox');
    await superClient.query('DELETE FROM tenant_feature_configurations');
    await superClient.query('DELETE FROM tenant_entitlements');
    await superClient.query('DELETE FROM branches');
    await superClient.query('DELETE FROM organizations');
    await superClient.query('DELETE FROM tenants');
  });

  describe('Tenant Provisioning', () => {
    it('should provision a tenant with organization and entitlements atomically', async () => {
      const result = await provisionTenant(adminDb, repo, outboxWriter, {
        name: 'Acme Healthcare Staffing',
        slug: 'acme-healthcare',
        organizationName: 'Acme Main',
        actorId: 'platform-admin-001',
        correlationId: 'corr-prov-001',
        idempotencyKey: 'idem-prov-001',
      });

      expect(result.tenantId).toBeDefined();
      expect(result.organizationId).toBeDefined();

      // Verify tenant created
      const tenantRow = await superClient.query('SELECT * FROM tenants WHERE id = $1', [
        result.tenantId,
      ]);
      expect(tenantRow.rows).toHaveLength(1);
      expect(tenantRow.rows[0].name).toBe('Acme Healthcare Staffing');
      expect(tenantRow.rows[0].status).toBe('PROVISIONING');

      // Verify organization created
      const orgRow = await superClient.query('SELECT * FROM organizations WHERE id = $1', [
        result.organizationId,
      ]);
      expect(orgRow.rows).toHaveLength(1);
      expect(orgRow.rows[0].tenant_id).toBe(result.tenantId);
      expect(orgRow.rows[0].name).toBe('Acme Main');

      // Verify default entitlements created
      const entRow = await superClient.query(
        'SELECT * FROM tenant_entitlements WHERE tenant_id = $1',
        [result.tenantId],
      );
      expect(entRow.rows).toHaveLength(1);
      expect(entRow.rows[0].modules.core).toBe(true);
      expect(entRow.rows[0].modules.scheduling).toBe(false);

      // Verify outbox event created
      const outboxRow = await superClient.query(
        "SELECT * FROM event_outbox WHERE event_type = 'carecareer.tenant.provisioned.v1'",
      );
      expect(outboxRow.rows).toHaveLength(1);
      expect(outboxRow.rows[0].tenant_id).toBe(result.tenantId);
      expect(outboxRow.rows[0].correlation_id).toBe('corr-prov-001');
    });

    it('should emit outbox event in the same transaction as domain write', async () => {
      const result = await provisionTenant(adminDb, repo, outboxWriter, {
        name: 'Atomic Test',
        slug: 'atomic-test',
        organizationName: 'Atomic Org',
        actorId: 'admin-1',
        correlationId: 'corr-atomic',
        idempotencyKey: 'idem-atomic',
      });

      // Both domain record and outbox should exist (committed together)
      const tenantCount = await superClient.query('SELECT count(*) FROM tenants WHERE id = $1', [
        result.tenantId,
      ]);
      const outboxCount = await superClient.query(
        'SELECT count(*) FROM event_outbox WHERE tenant_id = $1',
        [result.tenantId],
      );

      expect(parseInt(tenantCount.rows[0].count, 10)).toBe(1);
      expect(parseInt(outboxCount.rows[0].count, 10)).toBe(1);
    });
  });

  describe('RLS Tenant Isolation', () => {
    it('should prevent tenant A from reading tenant B organizations via RLS', async () => {
      // Provision two tenants
      const tenantA = await provisionTenant(adminDb, repo, outboxWriter, {
        name: 'Tenant A',
        slug: 'tenant-a',
        organizationName: 'Org A',
        actorId: 'admin',
        correlationId: 'c1',
        idempotencyKey: 'i1',
      });
      const tenantB = await provisionTenant(adminDb, repo, outboxWriter, {
        name: 'Tenant B',
        slug: 'tenant-b',
        organizationName: 'Org B',
        actorId: 'admin',
        correlationId: 'c2',
        idempotencyKey: 'i2',
      });

      // Query as Tenant A via app_service role with RLS
      const appClient = new Client({
        connectionString: container
          .getConnectionUri()
          .replace('platform_admin', 'app_service')
          .replace('test_password', 'app_pw'),
      });
      await appClient.connect();

      try {
        // Set tenant context to A
        await appClient.query('BEGIN');
        await appClient.query(`SELECT set_config('app.tenant_id', '${tenantA.tenantId}', true)`);

        // Query organizations — should only see Tenant A's
        const result = await appClient.query('SELECT * FROM organizations');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].tenant_id).toBe(tenantA.tenantId);
        expect(result.rows[0].name).toBe('Org A');

        // Should NOT see Tenant B's organization
        const bOrgs = result.rows.filter(
          (r: Record<string, unknown>) => r['tenant_id'] === tenantB.tenantId,
        );
        expect(bOrgs).toHaveLength(0);

        await appClient.query('COMMIT');
      } finally {
        await appClient.end();
      }
    });

    it('should return empty results when tenant context is not set', async () => {
      await provisionTenant(adminDb, repo, outboxWriter, {
        name: 'Orphan Tenant',
        slug: 'orphan',
        organizationName: 'Orphan Org',
        actorId: 'admin',
        correlationId: 'c3',
        idempotencyKey: 'i3',
      });

      const appClient = new Client({
        connectionString: container
          .getConnectionUri()
          .replace('platform_admin', 'app_service')
          .replace('test_password', 'app_pw'),
      });
      await appClient.connect();

      try {
        await appClient.query('BEGIN');
        // DO NOT set tenant context — RLS should return nothing
        const result = await appClient.query('SELECT * FROM organizations');
        expect(result.rows).toHaveLength(0);
        await appClient.query('COMMIT');
      } finally {
        await appClient.end();
      }
    });
  });

  describe('Outbox Event Integrity', () => {
    it('should include all required fields in outbox event', async () => {
      const result = await provisionTenant(adminDb, repo, outboxWriter, {
        name: 'Event Test',
        slug: 'event-test',
        organizationName: 'Event Org',
        actorId: 'admin-event',
        correlationId: 'corr-event-test',
        idempotencyKey: 'idem-event',
      });

      const outboxRow = await superClient.query('SELECT * FROM event_outbox WHERE tenant_id = $1', [
        result.tenantId,
      ]);

      const event = outboxRow.rows[0];
      expect(event.id).toBeDefined();
      expect(event.event_type).toBe('carecareer.tenant.provisioned.v1');
      expect(event.event_version).toBe(1);
      expect(event.tenant_id).toBe(result.tenantId);
      expect(event.aggregate_type).toBe('tenant');
      expect(event.aggregate_id).toBe(result.tenantId);
      expect(event.aggregate_version).toBe(1);
      expect(event.correlation_id).toBe('corr-event-test');
      expect(event.occurred_at).toBeDefined();
      expect(event.status).toBe('PENDING');

      // Verify payload contains expected data
      const payload = event.payload;
      expect(payload.eventType).toBe('carecareer.tenant.provisioned.v1');
      expect(payload.tenantId).toBe(result.tenantId);
      expect(payload.data.tenantId).toBe(result.tenantId);
      expect(payload.data.name).toBe('Event Test');
      expect(payload.data.organizationId).toBe(result.organizationId);
      expect(payload.actor).toBeDefined();
      expect(payload.actor.id).toBe('admin-event');
    });
  });
});

// Helper: minimal PrismaLikeClient backed by pg.Client
function createPrismaLike(connectionUri: string): import('@carecareer/database').PrismaLikeClient {
  return {
    async $transaction<T>(
      fn: (tx: import('@carecareer/database').TransactionClient) => Promise<T>,
      _options?: { maxWait?: number; timeout?: number },
    ): Promise<T> {
      const client = new Client({ connectionString: connectionUri });
      await client.connect();

      try {
        await client.query('BEGIN');

        const txClient: import('@carecareer/database').TransactionClient = {
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
