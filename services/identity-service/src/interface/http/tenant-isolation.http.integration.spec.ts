import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Controller,
  Get,
  Inject,
  type INestApplication,
  HttpStatus,
  NotFoundException,
  Param,
  Req,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';
import { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';

import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
  TENANT_DATABASE,
  TOKEN_VALIDATOR,
} from '../../application/ports/injection-tokens.js';
import { IdentityAuthGuard } from '../../infrastructure/identity-auth.guard.js';
import { generateRsaKeyPair, signPlatformJwt } from '../../infrastructure/jwt-service.js';
import { PlatformTokenValidator } from '../../infrastructure/platform-token-validator.js';
import { PostgresIdentityRepository } from '../../infrastructure/postgres-identity-repository.js';
import { PostgresSessionRepository } from '../../infrastructure/postgres-session-repository.js';
import { PostgresSigningKeyRepository } from '../../infrastructure/postgres-signing-key-repository.js';
import { SessionStateValidator } from '../../infrastructure/session-state-validator.js';

import { AuthController } from './auth.controller.js';
import { HealthController } from './health.controller.js';

// ─── Test-only probe controller ───────────────────────────────────────────────
// Derives tenant context from the validated principal (not from URL/header/body).
// Compares the authorized tenant with the route parameter and rejects mismatches.
// Queries a dedicated RLS-protected probe table to isolate tenant row filtering
// from membership-domain behavior.

interface AuthenticatedRequest {
  principal?: { selectedTenantId?: string };
}

@Controller('__test/tenants/:tenantId/resources')
class TenantIsolationProbeController {
  constructor(@Inject(TENANT_DATABASE) private readonly tenantDb: TenantAwareTransaction) {}

  @Get()
  async list(
    @Param('tenantId') requestedTenantId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: { resources: unknown[]; context: unknown[] } }> {
    // Never derive TenantAwareTransaction context from URL/header/body/query.
    // Derive it from the validated session's active tenant.
    const authorizedTenantId = req.principal?.selectedTenantId;

    if (!authorizedTenantId || authorizedTenantId !== requestedTenantId) {
      throw new NotFoundException();
    }

    const result = await this.tenantDb.execute(authorizedTenantId, async (tx) => {
      const resources = await tx.$queryRaw<{
        id: string;
        tenant_id: string;
        secret_value: string;
      }>`
        SELECT id, tenant_id, secret_value
        FROM identity.tenant_isolation_probe_resources
        ORDER BY secret_value`;

      const context = await tx.$queryRaw<{
        database_user: string;
        tenant_id: string;
        is_admin: string | null;
        backend_pid: number;
      }>`
        SELECT
          current_user AS database_user,
          current_setting('app.tenant_id', true) AS tenant_id,
          current_setting('app.is_admin', true) AS is_admin,
          pg_backend_pid() AS backend_pid`;

      return { resources, context };
    });

    return { data: result };
  }
}

// ─── Pool-based PrismaLikeClient factory ──────────────────────────────────────

function createPoolPrismaClient(connectionUri: string, maxConnections = 5): PrismaLikeClient {
  const innerPool = new Pool({ connectionString: connectionUri, max: maxConnections });
  innerPool.on('error', () => {});
  return {
    async $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      const conn = await innerPool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('SET LOCAL search_path TO identity, public');
        const tx: TransactionClient = {
          async $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<number> {
            let q = '';
            for (let i = 0; i < s.length; i++) {
              q += s[i];
              if (i < v.length) q += `$${i + 1}`;
            }
            return (await conn.query(q, v)).rowCount ?? 0;
          },
          async $queryRaw<R = Record<string, unknown>>(
            s: TemplateStringsArray,
            ...v: unknown[]
          ): Promise<R[]> {
            let q = '';
            for (let i = 0; i < s.length; i++) {
              q += s[i];
              if (i < v.length) q += `$${i + 1}`;
            }
            return (await conn.query(q, v)).rows as R[];
          },
        };
        const result = await fn(tx);
        await conn.query('COMMIT');
        return result;
      } catch (e) {
        await conn.query('ROLLBACK');
        throw e;
      } finally {
        conn.release();
      }
    },
  };
}

/**
 * HTTP Tenant-Resource RLS Isolation Integration Tests (GP-03.3)
 *
 * Proves tenant isolation through the full NestJS HTTP stack using:
 * - Real PlatformTokenValidator (RS256)
 * - Real IdentityAuthGuard with SessionStateValidator
 * - Real TenantAwareTransaction (SET LOCAL app.tenant_id)
 * - Real PostgreSQL with RLS policies (carecareer_app role)
 * - Dedicated tenant_isolation_probe_resources table with row-level security
 * - Supertest HTTP requests
 *
 * Security model:
 * - Tenant context is NEVER derived from URL, header, body, or query parameter
 * - Tenant context is derived from the validated session's active_tenant_id
 * - Route tenant parameter is compared against authorized tenant; mismatches → 404
 * - RLS provides defense-in-depth even if application code has bugs
 *
 * Separation:
 * - Admin operations (seeding, signing keys, sessions) use superuser
 * - Application operations (probe controller) use carecareer_app role
 *
 * Proves:
 * 1. Application database role cannot bypass RLS (rolsuper=false, rolbypassrls=false)
 * 2. Tenant context derived from validated principal, not URL
 * 3. Route tenant mismatch vs authorized tenant → 404
 * 4. User A sees only Tenant A resources through HTTP (RLS filters)
 * 5. User B sees only Tenant B resources through HTTP (RLS filters)
 * 6. Sequential pool requests don't leak app.tenant_id
 * 7. Rollback clears transaction-local context
 * 8. No request/JWT claim can set app.is_admin
 * 9. Database context confirms app role and tenant_id during query
 */
describe('HTTP Tenant-Resource RLS Isolation (GP-03.3)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let rawClient: Client;
  let appPrismaClient: PrismaLikeClient;
  let adminPrismaClient: PrismaLikeClient;
  let privateKeyPem: string;
  let keyId: string;

  const userAId = '00000000-0000-0000-0000-000000000a01';
  const userBId = '00000000-0000-0000-0000-000000000b01';
  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const sessionAId = '00000000-0000-0000-0000-000000000a10';
  const sessionBId = '00000000-0000-0000-0000-000000000b10';
  const membershipAId = '00000000-0000-0000-0000-000000000a20';
  const membershipBId = '00000000-0000-0000-0000-000000000b20';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('tenant_rls_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const superUri = container.getConnectionUri();
    rawClient = new Client({ connectionString: superUri });
    await rawClient.connect();

    // Apply all migrations (as superuser)
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', '..', 'prisma', 'migrations');
    for (const f of [
      '001_identity_schema.sql',
      '002_rls_and_grants.sql',
      '003_seed_roles_permissions.sql',
      '004_sessions_and_signing_keys.sql',
      '005_refresh_token_lineage.sql',
    ]) {
      await rawClient.query(readFileSync(resolve(migrationsDir, f), 'utf-8'));
    }

    // Build the app-role connection URI (subject to RLS)
    // Migration 001 creates carecareer_app with password 'carecareer_app_dev'
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const appUri = `postgresql://carecareer_app:carecareer_app_dev@${host}:${port}/tenant_rls_test`;

    // Create dedicated probe table with RLS (isolated from membership domain)
    await rawClient.query(`
      CREATE TABLE identity.tenant_isolation_probe_resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        secret_value VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE identity.tenant_isolation_probe_resources ENABLE ROW LEVEL SECURITY;
      ALTER TABLE identity.tenant_isolation_probe_resources FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON identity.tenant_isolation_probe_resources
        FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);
      GRANT SELECT, INSERT ON identity.tenant_isolation_probe_resources TO carecareer_app;
    `);

    // Seed distinguishable probe resources for each tenant
    await rawClient.query(
      `INSERT INTO identity.tenant_isolation_probe_resources (tenant_id, secret_value) VALUES ($1, 'TENANT_A_SECRET_ALPHA')`,
      [tenantAId],
    );
    await rawClient.query(
      `INSERT INTO identity.tenant_isolation_probe_resources (tenant_id, secret_value) VALUES ($1, 'TENANT_A_SECRET_BETA')`,
      [tenantAId],
    );
    await rawClient.query(
      `INSERT INTO identity.tenant_isolation_probe_resources (tenant_id, secret_value) VALUES ($1, 'TENANT_B_SECRET_GAMMA')`,
      [tenantBId],
    );

    // Create PrismaLikeClient for the app role (RLS-enforced, max=1 to force connection reuse)
    appPrismaClient = createPoolPrismaClient(appUri, 1);
    // Create PrismaLikeClient for the superuser (admin operations, session validation)
    adminPrismaClient = createPoolPrismaClient(superUri);

    // Seed signing key
    const { publicKeyPem, privateKeyPem: pk } = generateRsaKeyPair();
    privateKeyPem = pk;
    keyId = '00000000-0000-0000-0000-000000000f01';
    await rawClient.query(
      `INSERT INTO identity.signing_keys (id, algorithm, public_key, private_key_ref, status, activated_at, created_at)
       VALUES ($1, 'RS256', $2, 'inline:test', 'ACTIVE', NOW(), NOW())`,
      [keyId, publicKeyPem],
    );

    // Seed User A and User B
    await rawClient.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, 'User A', 'usera@rls.test', 'ACTIVE', 1, NOW(), NOW(), 1)`,
      [userAId],
    );
    await rawClient.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, 'User B', 'userb@rls.test', 'ACTIVE', 1, NOW(), NOW(), 1)`,
      [userBId],
    );

    // Seed distinguishable tenant memberships (RLS target table)
    await rawClient.query(
      `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW(), NOW())`,
      [membershipAId, userAId, tenantAId],
    );
    await rawClient.query(
      `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW(), NOW())`,
      [membershipBId, userBId, tenantBId],
    );

    // Seed sessions for both users
    await rawClient.query(
      `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, selected_tenant_id, membership_id, user_authorization_version, last_used_at, expires_at, created_at)
       VALUES ($1, $2, 'ACTIVE', 'hash_a', gen_random_uuid(), $3, $4, 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
      [sessionAId, userAId, tenantAId, membershipAId],
    );
    await rawClient.query(
      `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, selected_tenant_id, membership_id, user_authorization_version, last_used_at, expires_at, created_at)
       VALUES ($1, $2, 'ACTIVE', 'hash_b', gen_random_uuid(), $3, $4, 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
      [sessionBId, userBId, tenantBId, membershipBId],
    );

    // Build NestJS app with probe controller using app-role PrismaLikeClient (RLS)
    const sessionRepo = new PostgresSessionRepository();
    const signingKeyRepo = new PostgresSigningKeyRepository();
    const identityRepo = new PostgresIdentityRepository();
    // Token validation + session validation use admin prisma (reads signing keys, sessions)
    const tokenValidator = new PlatformTokenValidator(
      { issuer: 'carecareer-identity', audience: 'carecareer-api', clockToleranceSec: 30 },
      adminPrismaClient,
      signingKeyRepo,
    );
    const sessionValidator = new SessionStateValidator(adminPrismaClient, sessionRepo);

    // TenantAwareTransaction uses the app-role pool (subject to RLS)
    const tenantDb = new TenantAwareTransaction(appPrismaClient);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, AuthController, TenantIsolationProbeController],
      providers: [
        { provide: TOKEN_VALIDATOR, useValue: tokenValidator },
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector) => new IdentityAuthGuard(tokenValidator, r, sessionValidator),
          inject: [Reflector],
        },
        { provide: IDENTITY_REPOSITORY, useValue: identityRepo },
        {
          provide: ADMINISTRATIVE_DATABASE,
          useValue: new AdministrativeDatabase(adminPrismaClient),
        },
        { provide: TENANT_DATABASE, useValue: tenantDb },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await rawClient?.end();
    await new Promise((r) => setTimeout(r, 200));
    await container?.stop();
  });

  function tokenForUser(userId: string, sessionId: string, tenantId: string): Promise<string> {
    return signPlatformJwt(
      {
        sub: userId,
        user_authorization_version: 1,
        platform_roles: ['PLATFORM_ADMIN'],
        tenant_roles: [],
        permissions: [],
        sid: sessionId,
        active_tenant_id: tenantId,
      },
      privateKeyPem,
      keyId,
    );
  }

  // ─── Application role verification ───────────────────────────────────────────

  describe('Application database role security', () => {
    it('should confirm carecareer_app role has no superuser privileges', async () => {
      const result = await rawClient.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'carecareer_app'`,
      );
      expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it('should confirm carecareer_app is not table owner of probe_resources', async () => {
      const result = await rawClient.query(
        `SELECT tableowner FROM pg_tables
         WHERE schemaname = 'identity' AND tablename = 'tenant_isolation_probe_resources'`,
      );
      // Table owner is superuser (test_user), not app role
      expect(result.rows[0]?.tableowner).not.toBe('carecareer_app');
    });

    it('should confirm RLS is enabled and forced on probe_resources', async () => {
      const result = await rawClient.query(
        `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class
         WHERE oid = 'identity.tenant_isolation_probe_resources'::regclass`,
      );
      expect(result.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });
  });

  // ─── RLS row filtering through HTTP ──────────────────────────────────────────

  describe('RLS tenant-resource isolation via HTTP probe', () => {
    it('should return only Tenant A resources when authorized for Tenant A', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      const { resources, context } = res.body.data;
      // RLS: only rows where tenant_id matches app.tenant_id are visible
      expect(resources).toHaveLength(2);
      expect(resources[0].secret_value).toBe('TENANT_A_SECRET_ALPHA');
      expect(resources[1].secret_value).toBe('TENANT_A_SECRET_BETA');
      expect(resources.every((r: { tenant_id: string }) => r.tenant_id === tenantAId)).toBe(true);
      // Verify database context
      expect(context[0].database_user).toBe('carecareer_app');
      expect(context[0].tenant_id).toBe(tenantAId);
      expect(context[0].is_admin).toBeNull();
    });

    it('should return only Tenant B resources when authorized for Tenant B', async () => {
      const token = await tokenForUser(userBId, sessionBId, tenantBId);
      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantBId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      const { resources, context } = res.body.data;
      expect(resources).toHaveLength(1);
      expect(resources[0].secret_value).toBe('TENANT_B_SECRET_GAMMA');
      expect(resources[0].tenant_id).toBe(tenantBId);
      // No Tenant A secrets leaked
      expect(
        resources.find((r: { secret_value: string }) => r.secret_value.includes('TENANT_A')),
      ).toBeUndefined();
      // Verify database context
      expect(context[0].database_user).toBe('carecareer_app');
      expect(context[0].tenant_id).toBe(tenantBId);
    });

    it('should reject when URL tenant does not match authorized tenant (cross-tenant denial)', async () => {
      // User A authorized for Tenant A, but requesting Tenant B resources
      // The probe controller compares route param vs principal.selectedTenantId → 404
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantBId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should reject when URL tenant does not match (reverse direction)', async () => {
      // User B authorized for Tenant B, but requesting Tenant A resources
      const token = await tokenForUser(userBId, sessionBId, tenantBId);
      await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ─── Guaranteed connection reuse (pool max=1, pg_backend_pid verified) ──────

  describe('Guaranteed connection reuse does not leak app.tenant_id', () => {
    it('should use the same backend PID and still isolate tenant context', async () => {
      const tokenA = await tokenForUser(userAId, sessionAId, tenantAId);
      const tokenB = await tokenForUser(userBId, sessionBId, tenantBId);

      // Request 1: Tenant A context — record backend PID
      const resA = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(HttpStatus.OK);
      const pidA = resA.body.data.context[0].backend_pid;
      expect(resA.body.data.resources).toHaveLength(2);
      expect(resA.body.data.context[0].tenant_id).toBe(tenantAId);

      // Request 2: Tenant B context — pool max=1 forces same connection
      const resB = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantBId}/resources`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(HttpStatus.OK);
      const pidB = resB.body.data.context[0].backend_pid;
      expect(resB.body.data.resources).toHaveLength(1);
      expect(resB.body.data.context[0].tenant_id).toBe(tenantBId);

      // Request 3: Tenant A again — same PID, must see only Tenant A
      const resA2 = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(HttpStatus.OK);
      const pidA2 = resA2.body.data.context[0].backend_pid;
      expect(resA2.body.data.resources).toHaveLength(2);
      expect(
        resA2.body.data.resources.every((r: { tenant_id: string }) => r.tenant_id === tenantAId),
      ).toBe(true);

      // Prove same backend connection was reused (pool max=1)
      expect(pidA).toBe(pidB);
      expect(pidB).toBe(pidA2);
    });
  });

  // ─── Forced rollback clears context ──────────────────────────────────────────

  describe('Rollback clears transaction-local context', () => {
    it('should clear app.tenant_id and app.is_admin after forced rollback on same connection', async () => {
      // Step 1: Force an error inside TenantAwareTransaction to trigger rollback.
      // We do this by calling the appPrismaClient directly (simulating what the
      // probe controller does under the hood) with an intentional SQL error.
      try {
        await appPrismaClient.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantAId}::text, true)`;
          // Verify tenant context is set
          const ctx = await tx.$queryRaw<{ tid: string }>`
            SELECT current_setting('app.tenant_id', true) AS tid`;
          expect(ctx[0]!.tid).toBe(tenantAId);
          // Force an error — this triggers ROLLBACK
          throw new Error('FORCED_ROLLBACK_FOR_TEST');
        });
      } catch (e: unknown) {
        expect((e as Error).message).toBe('FORCED_ROLLBACK_FOR_TEST');
      }

      // Step 2: The same connection (pool max=1) is now back in the pool.
      // Execute another transaction and verify context is cleared.
      const result = await appPrismaClient.$transaction(async (tx) => {
        return tx.$queryRaw<{
          tenant_id: string | null;
          is_admin: string | null;
          backend_pid: number;
        }>`
          SELECT
            current_setting('app.tenant_id', true) AS tenant_id,
            current_setting('app.is_admin', true) AS is_admin,
            pg_backend_pid() AS backend_pid`;
      });

      // app.tenant_id must be cleared (null or empty string)
      expect(result[0]!.tenant_id === null || result[0]!.tenant_id === '').toBe(true);
      expect(result[0]!.is_admin === null || result[0]!.is_admin === '').toBe(true);
    });

    it('should serve correct tenant data on HTTP request after prior rollback', async () => {
      // Force a rollback on the app pool
      try {
        await appPrismaClient.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantBId}::text, true)`;
          throw new Error('FORCED_ROLLBACK_FOR_TEST');
        });
      } catch {
        /* expected */
      }

      // Now an HTTP request as Tenant A must see only Tenant A data
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.resources).toHaveLength(2);
      expect(res.body.data.context[0].tenant_id).toBe(tenantAId);
      // No residual tenantB context
      expect(
        res.body.data.resources.every((r: { tenant_id: string }) => r.tenant_id === tenantAId),
      ).toBe(true);
    });
  });

  // ─── Admin context protection ───────────────────────────────────────────────

  describe('No request/JWT claim can set app.is_admin', () => {
    it('should not allow X-Admin header to activate admin bypass', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      // Even with X-Admin: true header, probe should still be RLS-constrained
      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Admin', 'true')
        .expect(HttpStatus.OK);

      // Still only sees tenant A data (RLS is enforced, admin bypass not triggered)
      expect(res.body.data.resources).toHaveLength(2);
      expect(
        res.body.data.resources.every((r: { tenant_id: string }) => r.tenant_id === tenantAId),
      ).toBe(true);
      // Database context proves is_admin was never set
      expect(res.body.data.context[0].is_admin).toBeNull();
    });

    it('should not allow JWT platform_roles to bypass RLS', async () => {
      // PLATFORM_ADMIN role in JWT cannot override database-level RLS
      const token = await signPlatformJwt(
        {
          sub: userAId,
          user_authorization_version: 1,
          platform_roles: ['PLATFORM_ADMIN'],
          tenant_roles: ['TENANT_ADMIN'],
          permissions: ['platform.users.manage'],
          sid: sessionAId,
          active_tenant_id: tenantAId,
        },
        privateKeyPem,
        keyId,
      );
      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      // Still limited to tenant A by RLS — PLATFORM_ADMIN does not bypass
      expect(res.body.data.resources).toHaveLength(2);
      expect(res.body.data.context[0].database_user).toBe('carecareer_app');
      expect(res.body.data.context[0].is_admin).toBeNull();
    });

    it('should not allow request body tenant_id to override authorized tenant', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      // POST with body containing a different tenant_id
      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${token}`)
        .send({ tenant_id: tenantBId, tenantId: tenantBId })
        .expect(HttpStatus.OK);

      // Must still see only Tenant A data (body is ignored for context derivation)
      expect(res.body.data.resources).toHaveLength(2);
      expect(res.body.data.context[0].tenant_id).toBe(tenantAId);
    });

    it('should not allow malicious JWT claim app.is_admin=true to activate admin context', async () => {
      // Craft a valid RS256 JWT with extra malicious claims injected into the payload.
      // We import jose directly to build a custom token with arbitrary claims.
      const { importPKCS8, SignJWT } = await import('jose');
      const pk = await importPKCS8(privateKeyPem, 'RS256');
      const maliciousToken = await new SignJWT({
        active_tenant_id: tenantAId,
        user_authorization_version: 1,
        platform_roles: ['PLATFORM_ADMIN'],
        tenant_roles: [],
        permissions: [],
        sid: sessionAId,
        // Malicious claims attempting admin bypass
        'app.is_admin': 'true',
        is_admin: true,
        admin: true,
      })
        .setProtectedHeader({ alg: 'RS256', kid: keyId })
        .setIssuedAt()
        .setExpirationTime('900s')
        .setIssuer('carecareer-identity')
        .setAudience('carecareer-api')
        .setSubject(userAId)
        .setJti(crypto.randomUUID())
        .sign(pk);

      const res = await request(app.getHttpServer())
        .get(`/__test/tenants/${tenantAId}/resources`)
        .set('Authorization', `Bearer ${maliciousToken}`)
        .expect(HttpStatus.OK);

      // Database context proves is_admin was never activated
      expect(res.body.data.context[0].is_admin).toBeNull();
      // Still limited to tenant A resources only
      expect(res.body.data.resources).toHaveLength(2);
      expect(res.body.data.context[0].database_user).toBe('carecareer_app');
    });
  });

  // ─── Original authentication tests (preserved) ──────────────────────────────

  describe('Cross-tenant access denial (authentication layer)', () => {
    it('should allow User A to access their own authenticated endpoint', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);
      expect(res.body.data.userId).toBe(userAId);
    });

    it('should allow User B to access their own authenticated endpoint', async () => {
      const token = await tokenForUser(userBId, sessionBId, tenantBId);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);
      expect(res.body.data.userId).toBe(userBId);
    });

    it('should deny User A token when session belongs to a different user', async () => {
      const token = await signPlatformJwt(
        {
          sub: userAId,
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: sessionBId,
          active_tenant_id: tenantAId,
        },
        privateKeyPem,
        keyId,
      );
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should deny when JWT uses nonexistent session', async () => {
      const token = await signPlatformJwt(
        {
          sub: userAId,
          user_authorization_version: 1,
          platform_roles: [],
          tenant_roles: [],
          permissions: [],
          sid: '00000000-0000-0000-0000-ffffffffffff',
          active_tenant_id: tenantBId,
        },
        privateKeyPem,
        keyId,
      );
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Request and JWT claims cannot override tenant context', () => {
    it('should not allow X-Tenant-Id header to override authorization', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', tenantBId)
        .expect(HttpStatus.OK);
      expect(res.body.data.userId).toBe(userAId);
    });

    it('should not allow query param tenant_id to override authorization', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .query({ tenant_id: tenantBId })
        .expect(HttpStatus.OK);
      expect(res.body.data.userId).toBe(userAId);
    });
  });

  describe('Connection-pool tenant safety', () => {
    it('should not leak tenant context between sequential /me requests', async () => {
      const tokenA = await tokenForUser(userAId, sessionAId, tenantAId);
      const tokenB = await tokenForUser(userBId, sessionBId, tenantBId);

      const resA = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(HttpStatus.OK);
      expect(resA.body.data.userId).toBe(userAId);

      const resB = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(HttpStatus.OK);
      expect(resB.body.data.userId).toBe(userBId);

      const resA2 = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(HttpStatus.OK);
      expect(resA2.body.data.userId).toBe(userAId);
    });
  });
});
