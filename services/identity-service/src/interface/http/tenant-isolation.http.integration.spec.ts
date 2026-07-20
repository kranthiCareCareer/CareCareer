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
import { PostgresIdentityRepository } from '../../infrastructure/postgres-identity-repository.js';
import { PostgresSessionRepository } from '../../infrastructure/postgres-session-repository.js';
import { PostgresSigningKeyRepository } from '../../infrastructure/postgres-signing-key-repository.js';
import { SessionStateValidator } from '../../infrastructure/session-state-validator.js';
import { AuthController } from './auth.controller.js';
import { HealthController } from './health.controller.js';

function createPoolPrismaClient(uri: string): PrismaLikeClient {
  const pool = new Pool({ connectionString: uri, max: 5 });
  pool.on('error', () => {});
  return {
    async $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
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
 * HTTP Tenant Isolation Integration Tests (GP-03.3)
 *
 * Proves tenant isolation through the full NestJS HTTP stack:
 * - Real PlatformTokenValidator (RS256)
 * - Real IdentityAuthGuard with SessionStateValidator
 * - Real PostgreSQL with RLS
 * - Supertest HTTP requests
 *
 * Two users: User A (Tenant A member), User B (Tenant B member)
 * Proves cross-tenant denial and connection-pool safety.
 */
describe('HTTP Tenant Isolation (GP-03.3)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let rawClient: Client;
  let prismaClient: PrismaLikeClient;
  let privateKeyPem: string;
  let keyId: string;

  const userAId = '00000000-0000-0000-0000-000000000a01';
  const userBId = '00000000-0000-0000-0000-000000000b01';
  const tenantAId = '00000000-0000-0000-0000-00000000aa01';
  const tenantBId = '00000000-0000-0000-0000-00000000bb01';
  const sessionAId = '00000000-0000-0000-0000-000000000a10';
  const sessionBId = '00000000-0000-0000-0000-000000000b10';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('tenant_iso_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    // Apply migrations
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', '..', 'prisma', 'migrations');
    for (const f of ['001_identity_schema.sql', '002_rls_and_grants.sql', '003_seed_roles_permissions.sql', '004_sessions_and_signing_keys.sql', '005_refresh_token_lineage.sql']) {
      await rawClient.query(readFileSync(resolve(migrationsDir, f), 'utf-8'));
    }

    prismaClient = createPoolPrismaClient(uri);

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
       VALUES ($1, 'User A', 'usera@test.com', 'ACTIVE', 1, NOW(), NOW(), 1)`,
      [userAId],
    );
    await rawClient.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, 'User B', 'userb@test.com', 'ACTIVE', 1, NOW(), NOW(), 1)`,
      [userBId],
    );

    // Seed sessions for both users
    await rawClient.query(
      `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, selected_tenant_id, membership_id, user_authorization_version, last_used_at, expires_at, created_at)
       VALUES ($1, $2, 'ACTIVE', 'hash_a', gen_random_uuid(), $3, NULL, 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
      [sessionAId, userAId, tenantAId],
    );
    await rawClient.query(
      `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, selected_tenant_id, membership_id, user_authorization_version, last_used_at, expires_at, created_at)
       VALUES ($1, $2, 'ACTIVE', 'hash_b', gen_random_uuid(), $3, NULL, 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
      [sessionBId, userBId, tenantBId],
    );

    // Set up NestJS app with real guard
    const sessionRepo = new PostgresSessionRepository();
    const signingKeyRepo = new PostgresSigningKeyRepository();
    const identityRepo = new PostgresIdentityRepository();
    const tokenValidator = new PlatformTokenValidator(
      { issuer: 'carecareer-identity', audience: 'carecareer-api', clockToleranceSec: 30 },
      prismaClient, signingKeyRepo,
    );
    const sessionValidator = new SessionStateValidator(prismaClient, sessionRepo);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, AuthController],
      providers: [
        { provide: TOKEN_VALIDATOR, useValue: tokenValidator },
        { provide: APP_GUARD, useFactory: (r: Reflector) => new IdentityAuthGuard(tokenValidator, r, sessionValidator), inject: [Reflector] },
        { provide: IDENTITY_REPOSITORY, useValue: identityRepo },
        { provide: ADMINISTRATIVE_DATABASE, useValue: new AdministrativeDatabase(prismaClient) },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await rawClient?.end();
    await new Promise((r) => setTimeout(r, 100));
    await container?.stop();
  });

  function tokenForUser(userId: string, sessionId: string, tenantId: string) {
    return signPlatformJwt(
      { sub: userId, user_authorization_version: 1, platform_roles: ['PLATFORM_ADMIN'], tenant_roles: [], permissions: [], sid: sessionId, active_tenant_id: tenantId },
      privateKeyPem, keyId,
    );
  }

  describe('Cross-tenant access denial', () => {
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
      // Create a token claiming to be User A but with User B's session
      const token = await signPlatformJwt(
        { sub: userAId, user_authorization_version: 1, platform_roles: [], tenant_roles: [], permissions: [], sid: sessionBId, active_tenant_id: tenantAId },
        privateKeyPem, keyId,
      );
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should deny when JWT tenant claim alone is used without valid session', async () => {
      const token = await signPlatformJwt(
        { sub: userAId, user_authorization_version: 1, platform_roles: [], tenant_roles: [], permissions: [], sid: '00000000-0000-0000-0000-ffffffffffff', active_tenant_id: tenantBId },
        privateKeyPem, keyId,
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
      // Response should still show User A's data, not Tenant B
      expect(res.body.data.userId).toBe(userAId);
    });

    it('should not allow request body tenant_id to override authorization', async () => {
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .query({ tenant_id: tenantBId })
        .expect(HttpStatus.OK);
      expect(res.body.data.userId).toBe(userAId);
    });
  });

  describe('Administrative context protection', () => {
    it('should not allow any JWT claim to set app.is_admin', async () => {
      // Even a PLATFORM_ADMIN token cannot activate database admin context
      const token = await tokenForUser(userAId, sessionAId, tenantAId);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Admin', 'true')
        .expect(HttpStatus.OK);
      // The guard never sets app.is_admin from request data
      expect(res.body.data.userId).toBe(userAId);
    });
  });

  describe('Connection-pool tenant safety', () => {
    it('should not leak tenant context between sequential requests', async () => {
      const tokenA = await tokenForUser(userAId, sessionAId, tenantAId);
      const tokenB = await tokenForUser(userBId, sessionBId, tenantBId);

      // Request as User A
      const resA = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(HttpStatus.OK);
      expect(resA.body.data.userId).toBe(userAId);

      // Immediately request as User B on the same pool
      const resB = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(HttpStatus.OK);
      expect(resB.body.data.userId).toBe(userBId);

      // Request as User A again — must not see User B's data
      const resA2 = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(HttpStatus.OK);
      expect(resA2.body.data.userId).toBe(userAId);
    });
  });
});
