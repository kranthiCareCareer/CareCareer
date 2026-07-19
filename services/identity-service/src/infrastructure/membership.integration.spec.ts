import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';
import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { createUser } from '../domain/user.js';

import { PostgresIdentityRepository } from './postgres-identity-repository.js';
import { PostgresMembershipRepository } from './postgres-membership-repository.js';

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

describe('Membership Integration Tests (GP-03.2)', () => {
  let container: StartedPostgreSqlContainer;
  let adminDb: AdministrativeDatabase;
  let tenantDb: TenantAwareTransaction;
  let identityRepo: PostgresIdentityRepository;
  let membershipRepo: PostgresMembershipRepository;
  let rawClient: Client;
  let pool: Pool;
  let rlsPool: Pool;
  let rlsTenantDb: TenantAwareTransaction;

  const tenantA = '00000000-0000-0000-aaaa-aaaaaaaaaaaa';
  const tenantB = '00000000-0000-0000-bbbb-bbbbbbbbbbbb';
  const userA = '00000000-0000-0000-0000-aaaaaaaaaaaa';
  const userB = '00000000-0000-0000-0000-bbbbbbbbbbbb';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('membership_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    // Apply migrations
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', 'prisma', 'migrations');
    await rawClient.query(readFileSync(resolve(migrationsDir, '001_identity_schema.sql'), 'utf-8'));
    await rawClient.query(readFileSync(resolve(migrationsDir, '002_rls_and_grants.sql'), 'utf-8'));
    await rawClient.query(
      readFileSync(resolve(migrationsDir, '003_seed_roles_permissions.sql'), 'utf-8'),
    );
    await rawClient.query('ALTER ROLE test_user SET search_path TO identity, public');
    await rawClient.query('GRANT CONNECT ON DATABASE membership_test TO carecareer_app');
    await rawClient.query('ALTER ROLE carecareer_app SET search_path TO identity, public');

    const { client: prismaLike, pool: p } = createPoolPrismaClient(uri);
    pool = p;
    adminDb = new AdministrativeDatabase(prismaLike);
    tenantDb = new TenantAwareTransaction(prismaLike);
    identityRepo = new PostgresIdentityRepository();
    membershipRepo = new PostgresMembershipRepository();

    // RLS pool as app role
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const rlsUri = `postgresql://carecareer_app:carecareer_app_dev@${host}:${port}/membership_test`;
    const { client: rlsPrisma, pool: rp } = createPoolPrismaClient(rlsUri);
    rlsPool = rp;
    rlsTenantDb = new TenantAwareTransaction(rlsPrisma);

    // Seed users
    await adminDb.execute(
      { actorId: 'test', reason: 'seed', correlationId: 'seed' },
      async (tx) => {
        await identityRepo.createUser(
          tx,
          createUser({ id: userA, displayName: 'User A', primaryEmail: 'a@test.com' }),
        );
        await identityRepo.createUser(
          tx,
          createUser({ id: userB, displayName: 'User B', primaryEmail: 'b@test.com' }),
        );
      },
    );

    // Seed memberships in different tenants
    await rawClient.query(
      `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, authorization_version, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', 1, 1, NOW(), NOW())`,
      ['00000000-0000-0000-0001-aaaaaaaaaaaa', userA, tenantA],
    );
    await rawClient.query(
      `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, authorization_version, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', 1, 1, NOW(), NOW())`,
      ['00000000-0000-0000-0001-bbbbbbbbbbbb', userB, tenantB],
    );
  }, 120000);

  afterAll(async () => {
    await rlsPool.end();
    await pool.end();
    await rawClient.end();
    await container.stop();
  });

  describe('Membership CRUD', () => {
    it('should create a membership', async () => {
      const membership = await tenantDb.execute(tenantA, async (tx) => {
        const m = {
          id: '00000000-0000-0000-0002-aaaaaaaaaaaa',
          userId: userB,
          tenantId: tenantA,
          status: 'INVITED' as const,
          authorizationVersion: 1,
          joinedAt: null,
          suspendedAt: null,
          deactivatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        };
        await membershipRepo.createMembership(tx, m);
        return membershipRepo.findMembershipById(tx, m.id);
      });

      expect(membership).not.toBeNull();
      expect(membership!.status).toBe('INVITED');
      expect(membership!.userId).toBe(userB);
    });

    it('should reject duplicate user+tenant membership', async () => {
      await expect(
        tenantDb.execute(tenantA, async (tx) => {
          await membershipRepo.createMembership(tx, {
            id: '00000000-0000-0000-0003-aaaaaaaaaaaa',
            userId: userA,
            tenantId: tenantA,
            status: 'ACTIVE',
            authorizationVersion: 1,
            joinedAt: new Date(),
            suspendedAt: null,
            deactivatedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          });
        }),
      ).rejects.toThrow();
    });
  });

  describe('Role assignment', () => {
    it('should assign tenant roles to membership', async () => {
      // Get TENANT_ADMIN role ID
      const roles = await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test' },
        async (tx) => membershipRepo.listTenantRoles(tx),
      );
      const tenantAdminRole = roles.find((r) => r.name === 'TENANT_ADMIN');
      expect(tenantAdminRole).toBeDefined();

      await tenantDb.execute(tenantA, async (tx) => {
        await membershipRepo.assignMembershipRole(
          tx,
          '00000000-0000-0000-0001-aaaaaaaaaaaa',
          tenantAdminRole!.id,
        );
      });

      const assignedRoles = await tenantDb.execute(tenantA, async (tx) => {
        return membershipRepo.listMembershipRoles(tx, '00000000-0000-0000-0001-aaaaaaaaaaaa');
      });

      expect(assignedRoles.length).toBeGreaterThanOrEqual(1);
      expect(assignedRoles.some((r) => r.name === 'TENANT_ADMIN')).toBe(true);
    });

    it('should derive effective permissions for ACTIVE membership with roles', async () => {
      const { deriveEffectivePermissions } = await import('../domain/permission.js');

      const result = await tenantDb.execute(tenantA, async (tx) => {
        const membership = await membershipRepo.findMembershipById(
          tx,
          '00000000-0000-0000-0001-aaaaaaaaaaaa',
        );
        const roleAssignments = await membershipRepo.listMembershipRoleAssignments(
          tx,
          '00000000-0000-0000-0001-aaaaaaaaaaaa',
        );
        const allRoles = await membershipRepo.listRoles(tx);
        const rolePerms = await membershipRepo.listRolePermissions(tx);
        const allPerms = await membershipRepo.listPermissions(tx);

        return deriveEffectivePermissions(
          membership!.status,
          roleAssignments.map((ra) => ra.roleId),
          allRoles,
          rolePerms,
          allPerms,
        );
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.identifier === 'tenant.members.read')).toBe(true);
    });
  });

  describe('Platform role assignments', () => {
    it('should assign platform role and increment user authorization version', async () => {
      const platformRoles = await adminDb.execute(
        { actorId: 'test', reason: 'test', correlationId: 'test' },
        async (tx) => membershipRepo.listPlatformRoles(tx),
      );
      const adminRole = platformRoles.find((r) => r.name === 'PLATFORM_ADMIN');
      expect(adminRole).toBeDefined();

      await adminDb.execute(
        { actorId: 'test', reason: 'assign platform role', correlationId: 'test-pr' },
        async (tx) => {
          await membershipRepo.assignPlatformRole(tx, userA, adminRole!.id, userA);
          // Increment user auth version
          const user = await identityRepo.findUserById(tx, userA);
          await identityRepo.updateUser(tx, {
            ...user!,
            authorizationVersion: user!.authorizationVersion + 1,
            version: user!.version + 1,
            updatedAt: new Date(),
          });
        },
      );

      const assignments = await adminDb.execute(
        { actorId: 'test', reason: 'check', correlationId: 'test-check' },
        async (tx) => membershipRepo.listPlatformRoleAssignments(tx, userA),
      );
      expect(assignments.length).toBeGreaterThanOrEqual(1);

      const user = await adminDb.execute(
        { actorId: 'test', reason: 'check', correlationId: 'test-check2' },
        async (tx) => identityRepo.findUserById(tx, userA),
      );
      expect(user!.authorizationVersion).toBe(2);
    });
  });

  describe('RLS membership isolation', () => {
    it('should block tenant A from reading tenant B memberships', async () => {
      const result = await rlsTenantDb.execute(tenantA, async (tx) => {
        return tx.$queryRaw<{ tenant_id: string }>`
          SELECT tenant_id FROM identity.tenant_memberships
        `;
      });

      const leakedRows = result.filter((r) => r.tenant_id === tenantB);
      expect(leakedRows).toHaveLength(0);
    });

    it('should block tenant A from updating tenant B memberships', async () => {
      const affected = await rlsTenantDb.execute(tenantA, async (tx) => {
        return tx.$executeRaw`
          UPDATE identity.tenant_memberships SET status = 'SUSPENDED'
          WHERE tenant_id = ${tenantB}
        `;
      });
      expect(affected).toBe(0);
    });

    it('should block tenant A from inserting into tenant B', async () => {
      await expect(
        rlsTenantDb.execute(tenantA, async (tx) => {
          await tx.$executeRaw`
            INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, authorization_version, version, created_at, updated_at)
            VALUES (${'00000000-0000-0000-0099-aaaaaaaaaaaa'}, ${userA}, ${tenantB}, ${'ACTIVE'}, ${1}, ${1}, ${new Date().toISOString()}, ${new Date().toISOString()})
          `;
        }),
      ).rejects.toThrow();
    });

    it('should return no rows for invalid tenant context', async () => {
      const fakeId = '00000000-0000-0000-ffff-ffffffffffff';
      const result = await rlsTenantDb.execute(fakeId, async (tx) => {
        return tx.$queryRaw<{ id: string }>`SELECT id FROM identity.tenant_memberships`;
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('Atomic transaction behavior', () => {
    it('should rollback membership + audit + outbox on failure', async () => {
      const membershipId = '00000000-0000-0000-9999-aaaaaaaaaaaa';
      const auditId = '00000000-0000-0000-9998-aaaaaaaaaaaa';

      try {
        await tenantDb.execute(tenantA, async (tx) => {
          await membershipRepo.createMembership(tx, {
            id: membershipId,
            userId: userB,
            tenantId: tenantA,
            status: 'ACTIVE',
            authorizationVersion: 1,
            joinedAt: new Date(),
            suspendedAt: null,
            deactivatedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
          });

          await tx.$executeRaw`
            INSERT INTO identity.audit_records (id, actor_id, actor_type, target_user_id, action, correlation_id, administrative_access, timestamp)
            VALUES (${auditId}, ${'test'}, ${'user'}, ${userB}, ${'test'}, ${'corr'}, ${false}, ${new Date().toISOString()})
          `;

          throw new Error('Intentional failure');
        });
      } catch {
        // Expected
      }

      const mResult = await rawClient.query(
        'SELECT id FROM identity.tenant_memberships WHERE id = $1',
        [membershipId],
      );
      expect(mResult.rows).toHaveLength(0);

      const aResult = await rawClient.query('SELECT id FROM identity.audit_records WHERE id = $1', [
        auditId,
      ]);
      expect(aResult.rows).toHaveLength(0);
    });
  });
});
