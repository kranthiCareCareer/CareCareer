import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';
import { AdministrativeDatabase } from '@carecareer/database';

import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
  TOKEN_VALIDATOR,
} from '../../application/ports/injection-tokens.js';
import { IdentityAuthGuard } from '../../infrastructure/identity-auth.guard.js';
import { generateRsaKeyPair, signPlatformJwt } from '../../infrastructure/jwt-service.js';
import { PlatformTokenValidator } from '../../infrastructure/platform-token-validator.js';
import { PostgresAuthorizationRepository } from '../../infrastructure/postgres-authorization-repository.js';
import { PostgresIdentityRepository } from '../../infrastructure/postgres-identity-repository.js';
import { PostgresSessionRepository } from '../../infrastructure/postgres-session-repository.js';
import { PostgresSigningKeyRepository } from '../../infrastructure/postgres-signing-key-repository.js';
import { SessionStateValidator } from '../../infrastructure/session-state-validator.js';

import { AuthorizationController } from './authorization.controller.js';
import { HealthController } from './health.controller.js';

function createPoolPrisma(uri: string): PrismaLikeClient {
  const pool = new Pool({ connectionString: uri, max: 5 });
  pool.on('error', () => {});
  return {
    async $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('SET LOCAL search_path TO identity, public');
        const tx: TransactionClient = {
          async $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<number> {
            let q = '';
            for (let i = 0; i < s.length; i++) { q += s[i]; if (i < v.length) q += `$${i + 1}`; }
            return (await conn.query(q, v)).rowCount ?? 0;
          },
          async $queryRaw<R = Record<string, unknown>>(s: TemplateStringsArray, ...v: unknown[]): Promise<R[]> {
            let q = '';
            for (let i = 0; i < s.length; i++) { q += s[i]; if (i < v.length) q += `$${i + 1}`; }
            return (await conn.query(q, v)).rows as R[];
          },
        };
        const result = await fn(tx);
        await conn.query('COMMIT');
        return result;
      } catch (e) { await conn.query('ROLLBACK'); throw e; }
      finally { conn.release(); }
    },
  };
}

/**
 * GP-03.4 Authorization Decision HTTP Integration Tests
 *
 * Proves the full chain: real PostgreSQL → real RLS → real guard →
 * real authorization service → real audit persistence.
 */
describe('Authorization Decision HTTP Integration (GP-03.4)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let rawClient: Client;
  let prisma: PrismaLikeClient;
  let privateKeyPem: string;
  let keyId: string;

  const userAId = '00000000-0000-0000-0000-000000000a01';
  const userBId = '00000000-0000-0000-0000-000000000b01';
  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const sessionAId = '00000000-0000-0000-0000-000000000a10';
  const membershipAId = '00000000-0000-0000-0000-000000000a20';
  const membershipBId = '00000000-0000-0000-0000-000000000b20';
  const roleAdminId = '10000000-0000-0000-0000-000000000003'; // TENANT_ADMIN from seed

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('authz_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    // Apply all migrations
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', '..', 'prisma', 'migrations');
    for (const f of [
      '001_identity_schema.sql', '002_rls_and_grants.sql',
      '003_seed_roles_permissions.sql', '004_sessions_and_signing_keys.sql',
      '005_refresh_token_lineage.sql', '006_authorization_decisions.sql',
    ]) {
      await rawClient.query(readFileSync(resolve(migrationsDir, f), 'utf-8'));
    }

    prisma = createPoolPrisma(uri);

    // Seed signing key
    const { publicKeyPem, privateKeyPem: pk } = generateRsaKeyPair();
    privateKeyPem = pk;
    keyId = '00000000-0000-0000-0000-000000000f01';
    await rawClient.query(
      `INSERT INTO identity.signing_keys (id, algorithm, public_key, private_key_ref, status, activated_at, created_at)
       VALUES ($1, 'RS256', $2, 'inline:test', 'ACTIVE', NOW(), NOW())`,
      [keyId, publicKeyPem],
    );

    // Seed users
    await rawClient.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, 'User A', 'a@test.com', 'ACTIVE', 1, NOW(), NOW(), 1)`, [userAId]);
    await rawClient.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, 'User B', 'b@test.com', 'ACTIVE', 1, NOW(), NOW(), 1)`, [userBId]);

    // Seed memberships
    await rawClient.query(
      `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, authorization_version, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', 1, NOW(), NOW(), NOW())`, [membershipAId, userAId, tenantAId]);
    await rawClient.query(
      `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, authorization_version, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', 1, NOW(), NOW(), NOW())`, [membershipBId, userBId, tenantBId]);

    // Assign TENANT_ADMIN role to User A
    await rawClient.query(
      `INSERT INTO identity.membership_roles (membership_id, role_id) VALUES ($1, $2)`, [membershipAId, roleAdminId]);

    // Seed session for User A
    await rawClient.query(
      `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, selected_tenant_id, membership_id, user_authorization_version, last_used_at, expires_at, created_at)
       VALUES ($1, $2, 'ACTIVE', 'hash', gen_random_uuid(), $3, $4, 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
      [sessionAId, userAId, tenantAId, membershipAId]);

    // Build NestJS app
    const sessionRepo = new PostgresSessionRepository();
    const signingKeyRepo = new PostgresSigningKeyRepository();
    const identityRepo = new PostgresIdentityRepository();
    const authzRepo = new PostgresAuthorizationRepository();
    const tokenValidator = new PlatformTokenValidator(
      { issuer: 'carecareer-identity', audience: 'carecareer-api', clockToleranceSec: 30 },
      prisma, signingKeyRepo,
    );
    const sessionValidator = new SessionStateValidator(prisma, sessionRepo);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, AuthorizationController],
      providers: [
        { provide: TOKEN_VALIDATOR, useValue: tokenValidator },
        { provide: APP_GUARD, useFactory: (r: Reflector) => new IdentityAuthGuard(tokenValidator, r, sessionValidator), inject: [Reflector] },
        { provide: IDENTITY_REPOSITORY, useValue: identityRepo },
        { provide: ADMINISTRATIVE_DATABASE, useValue: new AdministrativeDatabase(prisma) },
        { provide: 'AUTHORIZATION_PRISMA', useValue: prisma },
        { provide: 'AUTHORIZATION_REPOSITORY', useValue: authzRepo },
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

  function issueToken(overrides: Record<string, unknown> = {}): Promise<string> {
    return signPlatformJwt({
      sub: userAId,
      user_authorization_version: 1,
      platform_roles: [],
      tenant_roles: ['TENANT_ADMIN'],
      permissions: [],
      sid: sessionAId,
      active_tenant_id: tenantAId,
      ...overrides,
    }, privateKeyPem, keyId);
  }

  // ─── Successful decisions ───────────────────────────────────────────────────

  describe('Successful authorization decisions', () => {
    it('should allow when user has matching permission from role', async () => {
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(true);
      expect(res.body.reasonCode).toBe('GRANTED');
      expect(res.body.decisionId).toBeDefined();
      expect(res.body.policyVersion).toBe(1);
    });

    it('should deny when permission does not exist', async () => {
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'payroll.process', resourceType: 'payroll' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('NO_MATCHING_GRANT');
    });

    it('should deny when membership has no roles assigned', async () => {
      // Remove all roles (exercises getPermissionsForRoles with empty roleIds)
      await rawClient.query(`DELETE FROM identity.membership_roles WHERE membership_id = $1`, [membershipAId]);
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('NO_MATCHING_GRANT');

      // Restore roles
      await rawClient.query(`INSERT INTO identity.membership_roles (membership_id, role_id) VALUES ($1, $2)`, [membershipAId, roleAdminId]);
    });
  });

  // ─── Explicit deny precedence ─────────────────────────────────────────────

  describe('Explicit deny overrides grants', () => {
    it('should deny when explicit denial exists even if permission is granted', async () => {
      // Insert an explicit denial for tenant.members.read
      await rawClient.query(
        `INSERT INTO identity.explicit_denials (tenant_id, principal_type, principal_id, action, active, reason, created_by)
         VALUES ($1, 'USER', $2, 'tenant.members.read', true, 'test denial', 'test')`,
        [tenantAId, userAId],
      );

      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('EXPLICIT_DENY');

      // Clean up
      await rawClient.query(`DELETE FROM identity.explicit_denials WHERE tenant_id = $1`, [tenantAId]);
    });
  });

  // ─── Version enforcement ──────────────────────────────────────────────────

  describe('Authorization version enforcement', () => {
    it('should deny when user authorization version is stale', async () => {
      // Increment user version in DB (simulates role change)
      await rawClient.query(
        `UPDATE identity.users SET authorization_version = 2 WHERE id = $1`, [userAId]);

      // Token still has version 1
      const token = await issueToken({ user_authorization_version: 1 });
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('VERSION_STALE');

      // Restore
      await rawClient.query(
        `UPDATE identity.users SET authorization_version = 1 WHERE id = $1`, [userAId]);
    });
  });

  // ─── State enforcement ────────────────────────────────────────────────────

  describe('User and membership state enforcement', () => {
    it('should deny when user is suspended', async () => {
      await rawClient.query(`UPDATE identity.users SET status = 'SUSPENDED' WHERE id = $1`, [userAId]);

      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('USER_SUSPENDED');

      await rawClient.query(`UPDATE identity.users SET status = 'ACTIVE' WHERE id = $1`, [userAId]);
    });

    it('should deny when membership is suspended', async () => {
      await rawClient.query(`UPDATE identity.tenant_memberships SET status = 'SUSPENDED' WHERE id = $1`, [membershipAId]);

      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('MEMBERSHIP_INVALID');

      await rawClient.query(`UPDATE identity.tenant_memberships SET status = 'ACTIVE' WHERE id = $1`, [membershipAId]);
    });
  });

  // ─── Caller override resistance ───────────────────────────────────────────

  describe('Caller cannot override trusted state', () => {
    it('should reject body with extra fields (strict schema)', async () => {
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'tenant.members.read',
          resourceType: 'member',
          userId: 'attacker',
          tenantId: tenantBId,
          roles: ['PLATFORM_ADMIN'],
          permissions: ['*'],
          isAdmin: true,
          is_admin: true,
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.code).toBe('INVALID_REQUEST');
    });

    it('should not allow malicious JWT claims to set admin context', async () => {
      // Token with hostile custom claims
      const token = await issueToken({
        'app.is_admin': 'true',
        is_admin: true,
        admin: true,
      });
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'payroll.process', resourceType: 'payroll' })
        .expect(HttpStatus.OK);

      // Still denied — malicious claims have no effect
      expect(res.body.allowed).toBe(false);
    });
  });

  // ─── Audit evidence ───────────────────────────────────────────────────────

  describe('Decision audit evidence', () => {
    it('should persist denial evidence in authorization_decisions table', async () => {
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-Id', 'audit-test-corr')
        .send({ action: 'unknown.action', resourceType: 'unknown' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);

      // Check audit record exists
      const audit = await rawClient.query(
        `SELECT * FROM identity.authorization_decisions WHERE id = $1::uuid`,
        [res.body.decisionId],
      );
      expect(audit.rows.length).toBe(1);
      expect(audit.rows[0].outcome).toBe('DENIED');
      expect(audit.rows[0].reason_code).toBe('NO_MATCHING_GRANT');
      expect(audit.rows[0].user_id).toBe(userAId);
      expect(audit.rows[0].tenant_id).toBe(tenantAId);
      expect(audit.rows[0].action).toBe('unknown.action');
      expect(audit.rows[0].correlation_id).toBe('audit-test-corr');
    });
  });

  // ─── Cross-tenant isolation ───────────────────────────────────────────────

  describe('Tenant isolation', () => {
    it('should deny when user has no membership in the selected tenant', async () => {
      // User A authenticated but tries to evaluate for Tenant B
      const token = await signPlatformJwt({
        sub: userAId,
        user_authorization_version: 1,
        platform_roles: [],
        tenant_roles: [],
        permissions: [],
        sid: sessionAId,
        active_tenant_id: tenantBId,
      }, privateKeyPem, keyId);

      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);

      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('MEMBERSHIP_INVALID');
    });

    it('should not reveal cross-tenant denial existence', async () => {
      await rawClient.query(
        `INSERT INTO identity.explicit_denials (tenant_id, principal_type, principal_id, action, active, reason, created_by)
         VALUES ($1, 'USER', $2, 'secret.action', true, 'b-only', 'test')`,
        [tenantBId, userBId]);
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'secret.action', resourceType: 'secret' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('NO_MATCHING_GRANT');
      await rawClient.query(`DELETE FROM identity.explicit_denials WHERE tenant_id = $1`, [tenantBId]);
    });
  });

  describe('Database role security', () => {
    it('should confirm RLS enabled and forced on explicit_denials', async () => {
      const r = await rawClient.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'identity.explicit_denials'::regclass`);
      expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });
    it('should confirm RLS enabled and forced on authorization_decisions', async () => {
      const r = await rawClient.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'identity.authorization_decisions'::regclass`);
      expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });
    it('should confirm carecareer_app has no superuser or bypassrls', async () => {
      const r = await rawClient.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'carecareer_app'`);
      expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    });
  });

  describe('Deactivated user', () => {
    it('should deny deactivated user', async () => {
      await rawClient.query(`UPDATE identity.users SET status = 'DEACTIVATED' WHERE id = $1`, [userAId]);
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('USER_DEACTIVATED');
      await rawClient.query(`UPDATE identity.users SET status = 'ACTIVE' WHERE id = $1`, [userAId]);
    });
  });

  describe('Membership-scoped denial and revocation', () => {
    it('should deny when denial targets the membership', async () => {
      await rawClient.query(
        `INSERT INTO identity.explicit_denials (tenant_id, principal_type, principal_id, action, active, reason, created_by)
         VALUES ($1, 'MEMBERSHIP', $2, 'tenant.members.invite', true, 'membership-scoped', 'test')`,
        [tenantAId, membershipAId]);
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.invite', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('EXPLICIT_DENY');
      await rawClient.query(`DELETE FROM identity.explicit_denials WHERE tenant_id = $1`, [tenantAId]);
    });

    it('should allow after denial is revoked', async () => {
      await rawClient.query(
        `INSERT INTO identity.explicit_denials (tenant_id, principal_type, principal_id, action, active, reason, created_by)
         VALUES ($1, 'USER', $2, 'tenant.members.read', false, 'revoked', 'test')`,
        [tenantAId, userAId]);
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(true);
      expect(res.body.reasonCode).toBe('GRANTED');
      await rawClient.query(`DELETE FROM identity.explicit_denials WHERE tenant_id = $1`, [tenantAId]);
    });
  });

  describe('Header and query override resistance', () => {
    it('should ignore X-Tenant-Id header override', async () => {
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', tenantBId)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(true);
    });

    it('should ignore query parameter overrides', async () => {
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .query({ tenantId: tenantBId, userId: userBId })
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(true);
    });
  });

  // ─── Table ownership and RLS enforcement ────────────────────────────────────

  describe('Table ownership enforcement', () => {
    it('should confirm carecareer_app is not owner of explicit_denials', async () => {
      const r = await rawClient.query(
        `SELECT tableowner FROM pg_tables WHERE schemaname='identity' AND tablename='explicit_denials'`);
      expect(r.rows[0]?.tableowner).not.toBe('carecareer_app');
    });

    it('should confirm carecareer_app is not owner of authorization_decisions', async () => {
      const r = await rawClient.query(
        `SELECT tableowner FROM pg_tables WHERE schemaname='identity' AND tablename='authorization_decisions'`);
      expect(r.rows[0]?.tableowner).not.toBe('carecareer_app');
    });
  });

  // ─── Pool reuse and rollback context ────────────────────────────────────────

  describe('Connection pool and rollback context hygiene', () => {
    it('should isolate tenant context across sequential authorization evaluations', async () => {
      // Tenant A evaluation
      const tokenA = await issueToken();
      const resA = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(resA.body.allowed).toBe(true);

      // Tenant B evaluation (different user)
      const sessionBId = '00000000-0000-0000-0000-000000000b10';
      await rawClient.query(
        `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, selected_tenant_id, membership_id, user_authorization_version, last_used_at, expires_at, created_at)
         VALUES ($1, $2, 'ACTIVE', 'hash_b', gen_random_uuid(), $3, $4, 1, NOW(), NOW() + INTERVAL '7 days', NOW())
         ON CONFLICT DO NOTHING`,
        [sessionBId, userBId, tenantBId, membershipBId]);
      // Assign TENANT_ADMIN to user B's membership
      await rawClient.query(
        `INSERT INTO identity.membership_roles (membership_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [membershipBId, roleAdminId]);

      const tokenB = await signPlatformJwt({
        sub: userBId, user_authorization_version: 1,
        platform_roles: [], tenant_roles: ['TENANT_ADMIN'], permissions: [],
        sid: sessionBId, active_tenant_id: tenantBId,
      }, privateKeyPem, keyId);
      const resB = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(resB.body.allowed).toBe(true);

      // Tenant A again — must still work correctly
      const resA2 = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(resA2.body.allowed).toBe(true);
    });
  });

  // ─── Deactivated membership ────────────────────────────────────────────────

  describe('Deactivated membership', () => {
    it('should deny when membership is deactivated', async () => {
      await rawClient.query(`UPDATE identity.tenant_memberships SET status = 'DEACTIVATED' WHERE id = $1`, [membershipAId]);
      const token = await issueToken();
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('MEMBERSHIP_INVALID');
      await rawClient.query(`UPDATE identity.tenant_memberships SET status = 'ACTIVE' WHERE id = $1`, [membershipAId]);
    });
  });

  // ─── Stale membership authorization version ────────────────────────────────

  describe('Stale membership authorization version', () => {
    it('should deny when membership authorization version is stale', async () => {
      await rawClient.query(`UPDATE identity.tenant_memberships SET authorization_version = 2 WHERE id = $1`, [membershipAId]);
      // Token has membership_authorization_version = 1 (default from issueToken not setting it)
      const token = await signPlatformJwt({
        sub: userAId, user_authorization_version: 1,
        platform_roles: [], tenant_roles: ['TENANT_ADMIN'], permissions: [],
        sid: sessionAId, active_tenant_id: tenantAId,
        membership_authorization_version: 1,
      }, privateKeyPem, keyId);
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(false);
      expect(res.body.reasonCode).toBe('VERSION_STALE');
      await rawClient.query(`UPDATE identity.tenant_memberships SET authorization_version = 1 WHERE id = $1`, [membershipAId]);
    });
  });

  // ─── Role removal after token issuance ─────────────────────────────────────

  describe('Role and permission removal after token issuance', () => {
    it('should deny after role is removed even with valid token', async () => {
      // Remove the TENANT_ADMIN role from membership
      await rawClient.query(`DELETE FROM identity.membership_roles WHERE membership_id = $1`, [membershipAId]);
      // Increment authorization version to reflect the change
      await rawClient.query(`UPDATE identity.users SET authorization_version = 2 WHERE id = $1`, [userAId]);

      const token = await issueToken({ user_authorization_version: 1 });
      const res = await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member' })
        .expect(HttpStatus.OK);
      expect(res.body.allowed).toBe(false);
      // Denied because version is stale (role change bumped version)
      expect(res.body.reasonCode).toBe('VERSION_STALE');

      // Restore
      await rawClient.query(`INSERT INTO identity.membership_roles (membership_id, role_id) VALUES ($1, $2)`, [membershipAId, roleAdminId]);
      await rawClient.query(`UPDATE identity.users SET authorization_version = 1 WHERE id = $1`, [userAId]);
    });
  });

  // ─── Validation ───────────────────────────────────────────────────────────

  describe('Request validation', () => {
    it('should reject empty action', async () => {
      const token = await issueToken();
      await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: '', resourceType: 'member' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject missing resourceType', async () => {
      const token = await issueToken();
      await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject malformed resourceId', async () => {
      const token = await issueToken();
      await request(app.getHttpServer())
        .post('/v1/authorization/decisions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'tenant.members.read', resourceType: 'member', resourceId: 'not-a-uuid' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
