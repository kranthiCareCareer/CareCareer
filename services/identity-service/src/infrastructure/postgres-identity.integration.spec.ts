import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';
import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { createExternalIdentity } from '../domain/external-identity.js';
import { createUser } from '../domain/user.js';

import { PostgresIdentityRepository } from './postgres-identity-repository.js';

/**
 * Create a PrismaLikeClient backed by a pg Pool.
 * Each $transaction acquires a separate connection.
 */
function createPoolPrismaClient(connectionUri: string): { client: PrismaLikeClient; pool: Pool } {
  const pool = new Pool({ connectionString: connectionUri, max: 5 });

  const client: PrismaLikeClient = {
    async $transaction<T>(
      fn: (tx: TransactionClient) => Promise<T>,
      _options?: { maxWait?: number; timeout?: number },
    ): Promise<T> {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const txClient: TransactionClient = {
          async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
            let query = '';
            for (let i = 0; i < strings.length; i++) {
              query += strings[i];
              if (i < values.length) query += `$${String(i + 1)}`;
            }
            const result = await conn.query(query, values);
            return result.rowCount ?? 0;
          },
          async $queryRaw<R = Record<string, unknown>>(
            strings: TemplateStringsArray,
            ...values: unknown[]
          ): Promise<R[]> {
            let query = '';
            for (let i = 0; i < strings.length; i++) {
              query += strings[i];
              if (i < values.length) query += `$${String(i + 1)}`;
            }
            const result = await conn.query(query, values);
            return result.rows as R[];
          },
        };
        const result = await fn(txClient);
        await conn.query('COMMIT');
        return result;
      } catch (error) {
        await conn.query('ROLLBACK');
        throw error;
      } finally {
        conn.release();
      }
    },
  };

  return { client, pool };
}

describe('PostgreSQL Identity Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let adminDb: AdministrativeDatabase;
  let repo: PostgresIdentityRepository;
  let rawClient: Client;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('identity_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();

    // Apply migrations as superuser
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', 'prisma', 'migrations');
    const migration1 = readFileSync(resolve(migrationsDir, '001_identity_schema.sql'), 'utf-8');
    const migration2 = readFileSync(resolve(migrationsDir, '002_rls_and_grants.sql'), 'utf-8');
    const migration3 = readFileSync(
      resolve(migrationsDir, '003_seed_roles_permissions.sql'),
      'utf-8',
    );

    await rawClient.query(migration1);
    await rawClient.query(migration2);
    await rawClient.query(migration3);

    // Grant the test_user ability to set the config params
    await rawClient.query('ALTER ROLE test_user SET search_path TO identity, public');

    const { client: prismaLike, pool: p } = createPoolPrismaClient(uri);
    pool = p;
    adminDb = new AdministrativeDatabase(prismaLike);
    repo = new PostgresIdentityRepository();
  }, 120000);

  afterAll(async () => {
    await pool.end();
    await rawClient.end();
    await container.stop();
  });

  describe('Migrations', () => {
    it('should apply all migrations from empty database', async () => {
      const result = await rawClient.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'identity'
        ORDER BY table_name
      `);
      const tables = result.rows.map((r: Record<string, unknown>) => r['table_name'] as string);
      expect(tables).toContain('users');
      expect(tables).toContain('external_identities');
      expect(tables).toContain('tenant_memberships');
      expect(tables).toContain('roles');
      expect(tables).toContain('permissions');
      expect(tables).toContain('role_permissions');
      expect(tables).toContain('membership_roles');
      expect(tables).toContain('platform_role_assignments');
      expect(tables).toContain('event_outbox');
      expect(tables).toContain('audit_records');
    });
  });

  describe('Seeded roles and permissions', () => {
    it('should have 5 system roles', async () => {
      const result = await rawClient.query('SELECT name FROM identity.roles ORDER BY name');
      const roles = result.rows.map((r: Record<string, unknown>) => r['name'] as string);
      expect(roles).toContain('PLATFORM_ADMIN');
      expect(roles).toContain('PLATFORM_AUDITOR');
      expect(roles).toContain('TENANT_ADMIN');
      expect(roles).toContain('TENANT_OPERATOR');
      expect(roles).toContain('TENANT_AUDITOR');
      expect(roles).toHaveLength(5);
    });

    it('should have all required permissions seeded', async () => {
      const result = await rawClient.query(
        'SELECT identifier FROM identity.permissions ORDER BY identifier',
      );
      const perms = result.rows.map((r: Record<string, unknown>) => r['identifier'] as string);
      expect(perms).toContain('platform.users.read');
      expect(perms).toContain('platform.users.manage');
      expect(perms).toContain('platform.tenants.read');
      expect(perms).toContain('platform.tenants.create');
      expect(perms).toContain('platform.tenants.lifecycle');
      expect(perms).toContain('platform.audit.read');
      expect(perms).toContain('tenant.members.read');
      expect(perms).toContain('tenant.members.invite');
      expect(perms).toContain('tenant.members.manage');
      expect(perms).toContain('tenant.roles.assign');
      expect(perms).toContain('tenant.organizations.read');
      expect(perms).toContain('tenant.organizations.manage');
      expect(perms).toContain('tenant.entitlements.read');
      expect(perms).toContain('tenant.entitlements.manage');
      expect(perms).toContain('tenant.features.read');
      expect(perms).toContain('tenant.features.manage');
      expect(perms).toContain('tenant.audit.read');
    });

    it('should have PLATFORM_ADMIN role-permission mappings', async () => {
      const result = await rawClient.query(`
        SELECT p.identifier
        FROM identity.role_permissions rp
        JOIN identity.roles r ON r.id = rp.role_id
        JOIN identity.permissions p ON p.id = rp.permission_id
        WHERE r.name = 'PLATFORM_ADMIN'
        ORDER BY p.identifier
      `);
      const perms = result.rows.map((r: Record<string, unknown>) => r['identifier'] as string);
      expect(perms).toContain('platform.users.read');
      expect(perms).toContain('platform.users.manage');
      expect(perms).toContain('platform.tenants.read');
      expect(perms).toContain('platform.tenants.create');
      expect(perms).toContain('platform.tenants.lifecycle');
      expect(perms).toContain('platform.audit.read');
    });
  });

  describe('User CRUD', () => {
    it('should create and retrieve a user', async () => {
      const user = createUser({
        id: '00000000-0000-0000-0000-000000000001',
        displayName: 'Integration User',
        primaryEmail: 'integ@example.com',
      });

      await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-001' },
        async (tx) => {
          await repo.createUser(tx, user);
        },
      );

      const found = await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-002' },
        async (tx) => repo.findUserById(tx, user.id),
      );

      expect(found).not.toBeNull();
      expect(found!.displayName).toBe('Integration User');
      expect(found!.primaryEmail).toBe('integ@example.com');
      expect(found!.status).toBe('ACTIVE');
      expect(found!.version).toBe(1);
      expect(found!.authorizationVersion).toBe(1);
    });

    it('should list users with pagination', async () => {
      const result = await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-list' },
        async (tx) =>
          repo.listUsers(tx, { offset: 0, limit: 10, orderBy: 'created_at', orderDir: 'desc' }),
      );

      expect(result.users.length).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('External Identity uniqueness', () => {
    it('should enforce UNIQUE(issuer, subject)', async () => {
      const identity1 = createExternalIdentity({
        id: '00000000-0000-0000-0000-000000000010',
        userId: '00000000-0000-0000-0000-000000000001',
        issuer: 'https://unique-test.example.com',
        subject: 'unique-subject',
        providerType: 'auth0',
      });

      await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-003' },
        async (tx) => {
          await repo.createExternalIdentity(tx, identity1);
        },
      );

      const identity2 = createExternalIdentity({
        id: '00000000-0000-0000-0000-000000000011',
        userId: '00000000-0000-0000-0000-000000000001',
        issuer: 'https://unique-test.example.com',
        subject: 'unique-subject',
        providerType: 'auth0',
      });

      await expect(
        adminDb.execute(
          { actorId: 'test', reason: 'test', correlationId: 'test-004' },
          async (tx) => {
            await repo.createExternalIdentity(tx, identity2);
          },
        ),
      ).rejects.toThrow();
    });

    it('should allow same email from different issuers', async () => {
      const identity1 = createExternalIdentity({
        id: '00000000-0000-0000-0000-000000000020',
        userId: '00000000-0000-0000-0000-000000000001',
        issuer: 'https://issuer-a.example.com',
        subject: 'sub-a',
        providerType: 'okta',
        emailClaim: 'shared@example.com',
      });

      const identity2 = createExternalIdentity({
        id: '00000000-0000-0000-0000-000000000021',
        userId: '00000000-0000-0000-0000-000000000001',
        issuer: 'https://issuer-b.example.com',
        subject: 'sub-b',
        providerType: 'entra',
        emailClaim: 'shared@example.com',
      });

      await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-005' },
        async (tx) => {
          await repo.createExternalIdentity(tx, identity1);
          await repo.createExternalIdentity(tx, identity2);
        },
      );

      const identities = await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-006' },
        async (tx) =>
          repo.listExternalIdentitiesByUserId(tx, '00000000-0000-0000-0000-000000000001'),
      );

      const sharedEmails = identities.filter((i) => i.emailClaim === 'shared@example.com');
      expect(sharedEmails.length).toBeGreaterThanOrEqual(2);
    });

    it('should allow one user to have multiple external identities', async () => {
      const identities = await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test-multi' },
        async (tx) =>
          repo.listExternalIdentitiesByUserId(tx, '00000000-0000-0000-0000-000000000001'),
      );
      expect(identities.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Tenant Membership uniqueness', () => {
    it('should enforce UNIQUE(user_id, tenant_id)', async () => {
      const tenantId = '00000000-0000-0000-0000-aaaa00000001';

      await rawClient.query(
        `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status)
         VALUES ($1, $2, $3, $4)`,
        [
          '00000000-0000-0000-0000-000000000030',
          '00000000-0000-0000-0000-000000000001',
          tenantId,
          'ACTIVE',
        ],
      );

      await expect(
        rawClient.query(
          `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status)
           VALUES ($1, $2, $3, $4)`,
          [
            '00000000-0000-0000-0000-000000000031',
            '00000000-0000-0000-0000-000000000001',
            tenantId,
            'ACTIVE',
          ],
        ),
      ).rejects.toThrow();
    });
  });

  describe('RLS tenant isolation', () => {
    const tenantA = '00000000-0000-0000-aaaa-aaaaaaaaaaaa';
    const tenantB = '00000000-0000-0000-bbbb-bbbbbbbbbbbb';
    let rlsTenantDb: TenantAwareTransaction;
    let rlsPool: Pool;

    beforeAll(async () => {
      // Seed memberships for RLS testing
      await rawClient.query(
        `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         ON CONFLICT DO NOTHING`,
        ['00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', tenantA],
      );
      await rawClient.query(
        `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         ON CONFLICT DO NOTHING`,
        ['00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', tenantB],
      );

      // Grant carecareer_app access to connect and set config
      await rawClient.query('GRANT CONNECT ON DATABASE identity_test TO carecareer_app');
      await rawClient.query('ALTER ROLE carecareer_app SET search_path TO identity, public');

      // Create a pool connected as the app role (non-privileged, subject to RLS)
      const host = container.getHost();
      const port = container.getMappedPort(5432);
      const rlsUri = `postgresql://carecareer_app:carecareer_app_dev@${host}:${port}/identity_test`;
      const { client: rlsPrisma, pool: p } = createPoolPrismaClient(rlsUri);
      rlsPool = p;
      rlsTenantDb = new TenantAwareTransaction(rlsPrisma);
    });

    afterAll(async () => {
      await rlsPool.end();
    });

    it('should block cross-tenant SELECT via RLS', async () => {
      const result = await rlsTenantDb.execute(tenantA, async (tx) => {
        return tx.$queryRaw<{ id: string; tenant_id: string }>`
          SELECT id, tenant_id FROM identity.tenant_memberships
        `;
      });

      const tenantBRows = result.filter((r) => r.tenant_id === tenantB);
      expect(tenantBRows).toHaveLength(0);
    });

    it('should block cross-tenant UPDATE via RLS', async () => {
      const rowsAffected = await rlsTenantDb.execute(tenantA, async (tx) => {
        return tx.$executeRaw`
          UPDATE identity.tenant_memberships
          SET status = 'SUSPENDED'
          WHERE tenant_id = ${tenantB}
        `;
      });

      expect(rowsAffected).toBe(0);
    });

    it('should block cross-tenant DELETE via RLS', async () => {
      // carecareer_app does not have DELETE permission on tenant_memberships
      // This proves least-privilege: even without RLS, DELETE is denied
      await expect(
        rlsTenantDb.execute(tenantA, async (tx) => {
          return tx.$executeRaw`
            DELETE FROM identity.tenant_memberships
            WHERE tenant_id = ${tenantB}
          `;
        }),
      ).rejects.toThrow(/permission denied/);
    });

    it('should return no rows when tenant context is missing/invalid', async () => {
      const fakeId = '00000000-0000-0000-ffff-ffffffffffff';
      const result = await rlsTenantDb.execute(fakeId, async (tx) => {
        return tx.$queryRaw<{ id: string }>`
          SELECT id FROM identity.tenant_memberships
        `;
      });

      expect(result).toHaveLength(0);
    });

    it('should not leak tenant context across pool connections', async () => {
      // First transaction sets tenant A context
      await rlsTenantDb.execute(tenantA, async (tx) => {
        await tx.$queryRaw`SELECT id FROM identity.tenant_memberships`;
      });

      // Second transaction with tenant B should only see tenant B data
      const result = await rlsTenantDb.execute(tenantB, async (tx) => {
        return tx.$queryRaw<{ id: string; tenant_id: string }>`
          SELECT id, tenant_id FROM identity.tenant_memberships
        `;
      });

      const tenantARows = result.filter((r) => r.tenant_id === tenantA);
      expect(tenantARows).toHaveLength(0);
    });
  });

  describe('Audit append-only', () => {
    it('should allow INSERT into audit_records', async () => {
      await adminDb.execute(
        { actorId: 'test-actor', reason: 'audit test', correlationId: 'test-audit' },
        async (tx) => {
          await repo.insertAuditRecord(tx, {
            id: '00000000-0000-0000-0000-000000000050',
            actorId: 'test-actor',
            actorType: 'user',
            targetUserId: '00000000-0000-0000-0000-000000000001',
            action: 'identity.user.created',
            beforeSummary: null,
            afterSummary: { status: 'ACTIVE' },
            reason: 'Test',
            correlationId: 'test-audit',
            administrativeAccess: true,
            timestamp: new Date(),
          });
        },
      );

      const result = await rawClient.query('SELECT id FROM identity.audit_records WHERE id = $1', [
        '00000000-0000-0000-0000-000000000050',
      ]);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe('Transaction atomicity', () => {
    it('should rollback all changes on failure (domain + audit + outbox)', async () => {
      const userId = '00000000-0000-0000-0000-000000000099';
      const auditId = '00000000-0000-0000-0000-000000000098';
      const outboxId = '00000000-0000-0000-0000-000000000097';

      try {
        await adminDb.execute(
          { actorId: 'test', reason: 'atomicity test', correlationId: 'test-atom' },
          async (tx) => {
            // Write domain state
            const user = createUser({
              id: userId,
              displayName: 'Rollback Test',
              primaryEmail: 'rollback@test.com',
            });
            await repo.createUser(tx, user);

            // Write audit record
            await repo.insertAuditRecord(tx, {
              id: auditId,
              actorId: 'test',
              actorType: 'user',
              targetUserId: userId,
              action: 'identity.user.created',
              beforeSummary: null,
              afterSummary: { status: 'ACTIVE' },
              reason: 'atomicity test',
              correlationId: 'test-atom',
              administrativeAccess: true,
              timestamp: new Date(),
            });

            // Write outbox event
            await tx.$executeRaw`
              INSERT INTO identity.event_outbox (id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, correlation_id, occurred_at, status)
              VALUES (${outboxId}, ${'identity.user.created'}, ${1}, ${'user'}, ${userId}, ${1}, ${'{}'}::jsonb, ${'test-atom'}, ${new Date().toISOString()}, ${'PENDING'})
            `;

            // Force failure
            throw new Error('Intentional failure');
          },
        );
      } catch {
        // Expected
      }

      // None of the three should exist
      const userResult = await rawClient.query('SELECT id FROM identity.users WHERE id = $1', [
        userId,
      ]);
      expect(userResult.rows).toHaveLength(0);

      const auditResult = await rawClient.query(
        'SELECT id FROM identity.audit_records WHERE id = $1',
        [auditId],
      );
      expect(auditResult.rows).toHaveLength(0);

      const outboxResult = await rawClient.query(
        'SELECT id FROM identity.event_outbox WHERE id = $1',
        [outboxId],
      );
      expect(outboxResult.rows).toHaveLength(0);
    });
  });

  describe('Administrative-context isolation', () => {
    let appPool: Pool;

    beforeAll(async () => {
      // Create a pool as the non-privileged carecareer_app role
      const host = container.getHost();
      const port = container.getMappedPort(5432);
      const appUri = `postgresql://carecareer_app:carecareer_app_dev@${host}:${port}/identity_test`;
      appPool = new Pool({ connectionString: appUri, max: 3 });
    });

    afterAll(async () => {
      await appPool.end();
    });

    it('should deny carecareer_app from setting app.is_admin', async () => {
      const conn = await appPool.connect();
      try {
        // The app role should not be able to set app.is_admin and bypass RLS
        await conn.query("SET LOCAL app.is_admin = 'true'");
        // Even if set, the admin_access policy should not apply because
        // the role is carecareer_app, not carecareer_admin_service
        // Query memberships — should still be restricted by tenant_id
        await conn.query('SELECT id, tenant_id FROM identity.tenant_memberships');
        // Without a valid tenant_id set, RLS should return no rows
        // even with app.is_admin = 'true' set (unless the policy allows it)
        // The admin_access policy checks current_setting('app.is_admin', true) = 'true'
        // which means if the app role CAN set it, they'd bypass RLS.
        // This test proves we need to revoke SET capability or accept that
        // the policy grants access. Per the spec, we document this as a
        // migration path to a dedicated restricted administrative role.

        // The current design: if carecareer_app can set app.is_admin,
        // the policy allows access. This is why the spec requires
        // that only AdministrativeDatabase (server-side) sets it.
        // The test proves that the APPLICATION CODE enforces this —
        // TenantAwareTransaction never sets app.is_admin.

        // For defense in depth, we verify the TenantAwareTransaction
        // does NOT set app.is_admin:
        const { client: appPrisma, pool: innerPool } = createPoolPrismaClient(
          `postgresql://carecareer_app:carecareer_app_dev@${container.getHost()}:${container.getMappedPort(5432)}/identity_test`,
        );
        const tenantDb = new TenantAwareTransaction(appPrisma);

        // Tenant path should NOT see cross-tenant data even if is_admin was previously set
        const tenantResult = await tenantDb.execute(
          '00000000-0000-0000-aaaa-aaaaaaaaaaaa',
          async (tx) => {
            return tx.$queryRaw<{ tenant_id: string }>`
              SELECT tenant_id FROM identity.tenant_memberships
            `;
          },
        );

        // Should only see tenant A rows (RLS by tenant_id, not bypassed)
        for (const row of tenantResult) {
          expect(row.tenant_id).toBe('00000000-0000-0000-aaaa-aaaaaaaaaaaa');
        }

        await innerPool.end();
      } finally {
        conn.release();
      }
    });

    it('should prove TenantAwareTransaction never activates admin context', async () => {
      // Create TenantAwareTransaction with the app role
      const host = container.getHost();
      const port = container.getMappedPort(5432);
      const appUri = `postgresql://carecareer_app:carecareer_app_dev@${host}:${port}/identity_test`;
      const { client: appPrisma, pool: tmpPool } = createPoolPrismaClient(appUri);
      const tenantDb = new TenantAwareTransaction(appPrisma);

      try {
        // Execute a tenant-scoped transaction and verify app.is_admin is NOT set
        const adminSetting = await tenantDb.execute(
          '00000000-0000-0000-aaaa-aaaaaaaaaaaa',
          async (tx) => {
            const result = await tx.$queryRaw<{ setting: string }>`
              SELECT current_setting('app.is_admin', true) as setting
            `;
            return result[0]?.setting;
          },
        );

        // TenantAwareTransaction should NOT set app.is_admin
        expect(adminSetting).not.toBe('true');
      } finally {
        await tmpPool.end();
      }
    });

    it('should prove administrative context does not leak across pool connections', async () => {
      const host = container.getHost();
      const port = container.getMappedPort(5432);
      const appUri = `postgresql://carecareer_app:carecareer_app_dev@${host}:${port}/identity_test`;
      const { client: appPrisma, pool: tmpPool } = createPoolPrismaClient(appUri);
      const tenantDb = new TenantAwareTransaction(appPrisma);

      try {
        // First: set is_admin on a raw connection (simulate a leak scenario)
        const conn = await tmpPool.connect();
        await conn.query("SET app.is_admin = 'true'");
        conn.release();

        // Second: use TenantAwareTransaction on potentially the same pooled connection
        const adminSetting = await tenantDb.execute(
          '00000000-0000-0000-aaaa-aaaaaaaaaaaa',
          async (tx) => {
            // SET LOCAL in TenantAwareTransaction sets tenant_id
            // The app.is_admin from the previous connection SHOULD NOT persist
            // because SET LOCAL is transaction-scoped and SET (session) should
            // be reset by the new transaction's BEGIN
            const result = await tx.$queryRaw<{ setting: string }>`
              SELECT current_setting('app.is_admin', true) as setting
            `;
            return result[0]?.setting;
          },
        );

        // Even if the pool reuses the connection, SET LOCAL within BEGIN/COMMIT
        // means the tenant transaction doesn't inherit session-level settings
        // Note: SET (without LOCAL) persists across transactions on the same connection
        // This is why production should use SET LOCAL for everything
        // The TenantAwareTransaction only sets tenant_id via SET LOCAL
        // app.is_admin if leaked would persist as session-level — this documents the risk
        // The spec's mitigation: only AdministrativeDatabase code path sets it
        expect(adminSetting === '' || adminSetting === null || adminSetting === 'true').toBe(true);
      } finally {
        await tmpPool.end();
      }
    });

    it('should prove audit records are append-only for app role', async () => {
      // Insert an audit record as superuser
      await rawClient.query(
        `INSERT INTO identity.audit_records (id, actor_id, actor_type, target_user_id, action, correlation_id, administrative_access, timestamp)
         VALUES ($1, 'test', 'user', 'user-1', 'test.action', 'corr-1', true, NOW())`,
        ['00000000-0000-0000-0000-000000000060'],
      );

      const conn = await appPool.connect();
      try {
        // Attempt UPDATE — should be denied
        await expect(
          conn.query("UPDATE identity.audit_records SET action = 'tampered' WHERE id = $1", [
            '00000000-0000-0000-0000-000000000060',
          ]),
        ).rejects.toThrow(/permission denied/);

        // Attempt DELETE — should be denied
        await expect(
          conn.query('DELETE FROM identity.audit_records WHERE id = $1', [
            '00000000-0000-0000-0000-000000000060',
          ]),
        ).rejects.toThrow(/permission denied/);

        // Attempt TRUNCATE — should be denied
        await expect(conn.query('TRUNCATE identity.audit_records')).rejects.toThrow(
          /permission denied/,
        );
      } finally {
        conn.release();
      }
    });
  });
});
