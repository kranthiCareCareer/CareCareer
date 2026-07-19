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
import {
  PostgresSessionRepository,
  PostgresSigningKeyRepository,
} from '../../infrastructure/postgres-session-repository.js';
import { SessionStateValidator } from '../../infrastructure/session-state-validator.js';
import { HealthController } from './health.controller.js';

import { AuthController } from './auth.controller.js';

/**
 * Full HTTP integration test proving membership authorization
 * through the real production guard with real PostgreSQL.
 *
 * Uses:
 * - Real PlatformTokenValidator (RS256)
 * - Real SessionStateValidator (PostgreSQL)
 * - Real IdentityAuthGuard
 * - Real PostgreSQL via Testcontainers
 * - Real signing keys
 * - Supertest HTTP requests
 */
describe('Production HTTP Guard Integration (GP-03.3)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let rawClient: Client;
  let pool: Pool;
  let prismaClient: PrismaLikeClient;
  let privateKeyPem: string;
  let keyId: string;
  let sessionRepo: PostgresSessionRepository;

  const userId = '00000000-0000-0000-0000-000000000300';
  const tenantId = '00000000-0000-0000-0000-000000000400';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('guard_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    // Apply migrations
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', '..', 'prisma', 'migrations');
    const files = [
      '001_identity_schema.sql',
      '002_rls_and_grants.sql',
      '003_seed_roles_permissions.sql',
      '004_sessions_and_signing_keys.sql',
      '005_refresh_token_lineage.sql',
    ];
    for (const f of files) {
      await rawClient.query(readFileSync(resolve(migrationsDir, f), 'utf-8'));
    }

    // Create pool-based prisma client
    pool = new Pool({ connectionString: uri, max: 10 });
    pool.on('error', () => {
      /* suppress connection terminated during cleanup */
    });
    prismaClient = createPoolPrismaClient(uri);

    // Seed signing key
    const { publicKeyPem, privateKeyPem: pk } = generateRsaKeyPair();
    privateKeyPem = pk;
    keyId = '00000000-0000-0000-0000-000000000020';
    await rawClient.query(
      `INSERT INTO identity.signing_keys (id, algorithm, public_key, private_key_ref, status, activated_at, created_at)
       VALUES ($1, 'RS256', $2, 'inline:test', 'ACTIVE', NOW(), NOW())`,
      [keyId, publicKeyPem],
    );

    // Seed user
    await rawClient.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, 'Guard Test User', 'guard@test.com', 'ACTIVE', 1, NOW(), NOW(), 1)`,
      [userId],
    );

    // Create session for the user
    const sessionId = '00000000-0000-0000-0000-000000000500';
    await rawClient.query(
      `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, user_authorization_version, last_used_at, expires_at, created_at)
       VALUES ($1, $2, 'ACTIVE', 'dummy_hash', gen_random_uuid(), 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
      [sessionId, userId],
    );

    // Set up the NestJS app with REAL production guard
    sessionRepo = new PostgresSessionRepository();
    const signingKeyRepo = new PostgresSigningKeyRepository();
    const identityRepo = new PostgresIdentityRepository();

    const tokenValidator = new PlatformTokenValidator(
      { issuer: 'carecareer-identity', audience: 'carecareer-api', clockToleranceSec: 30 },
      prismaClient,
      signingKeyRepo,
    );

    const sessionValidator = new SessionStateValidator(prismaClient, sessionRepo);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, AuthController],
      providers: [
        { provide: TOKEN_VALIDATOR, useValue: tokenValidator },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) =>
            new IdentityAuthGuard(tokenValidator, reflector, sessionValidator),
          inject: [Reflector],
        },
        { provide: IDENTITY_REPOSITORY, useValue: identityRepo },
        {
          provide: ADMINISTRATIVE_DATABASE,
          useValue: new AdministrativeDatabase(prismaClient),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await rawClient?.end();
    // Allow connection pool to drain before stopping container
    await new Promise((r) => setTimeout(r, 100));
    await pool?.end();
    await container?.stop();
  });

  async function issueToken(overrides: Record<string, unknown> = {}): Promise<string> {
    return signPlatformJwt(
      {
        sub: userId,
        user_authorization_version: 1,
        platform_roles: ['PLATFORM_ADMIN'],
        tenant_roles: ['TENANT_ADMIN'],
        permissions: ['users:read', 'users:write'],
        sid: '00000000-0000-0000-0000-000000000500',
        active_tenant_id: tenantId,
        ...overrides,
      },
      privateKeyPem,
      keyId,
    );
  }

  describe('Production RS256 guard with real PostgreSQL', () => {
    it('should accept a valid RS256 token with ACTIVE session', async () => {
      const token = await issueToken();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.userId).toBe(userId);
    });

    it('should reject after session is revoked (AUTH_SESSION_REVOKED)', async () => {
      // Create a separate session for this test
      const revokedSessionId = '00000000-0000-0000-0000-000000000501';
      await rawClient.query(
        `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, user_authorization_version, last_used_at, expires_at, created_at)
         VALUES ($1, $2, 'REVOKED', 'hash_revoked', gen_random_uuid(), 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
        [revokedSessionId, userId],
      );

      const token = await issueToken({ sid: revokedSessionId });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.code).toBe('AUTH_SESSION_REVOKED');
    });

    it('should reject after session is compromised (AUTH_SESSION_COMPROMISED)', async () => {
      const compromisedSessionId = '00000000-0000-0000-0000-000000000502';
      await rawClient.query(
        `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, user_authorization_version, last_used_at, expires_at, created_at)
         VALUES ($1, $2, 'COMPROMISED', 'hash_comp', gen_random_uuid(), 1, NOW(), NOW() + INTERVAL '7 days', NOW())`,
        [compromisedSessionId, userId],
      );

      const token = await issueToken({ sid: compromisedSessionId });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.code).toBe('AUTH_SESSION_COMPROMISED');
    });

    it('should reject expired session (AUTH_SESSION_EXPIRED)', async () => {
      const expiredSessionId = '00000000-0000-0000-0000-000000000503';
      await rawClient.query(
        `INSERT INTO identity.auth_sessions (id, user_id, status, refresh_token_hash, token_family, user_authorization_version, last_used_at, expires_at, created_at)
         VALUES ($1, $2, 'ACTIVE', 'hash_expired', gen_random_uuid(), 1, NOW(), NOW() - INTERVAL '1 second', NOW())`,
        [expiredSessionId, userId],
      );

      const token = await issueToken({ sid: expiredSessionId });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.code).toBe('AUTH_SESSION_EXPIRED');
    });

    it('should reject token with nonexistent session ID (AUTH_TOKEN_INVALID)', async () => {
      const token = await issueToken({ sid: '00000000-0000-0000-0000-ffffffffffff' });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('should reject HS256 demo token through production guard', async () => {
      // Create a demo-style HS256 token
      const { createHmac } = await import('node:crypto');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: userId,
          iss: 'carecareer-demo',
          aud: 'carecareer-api',
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString('base64url');
      const sig = createHmac('sha256', 'any-secret')
        .update(`${header}.${payload}`)
        .digest('base64url');
      const demoToken = `${header}.${payload}.${sig}`;

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${demoToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should reject alg=none token through production guard', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: userId })).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${noneToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function createPoolPrismaClient(connectionUri: string): PrismaLikeClient {
  const innerPool = new Pool({ connectionString: connectionUri, max: 10 });
  innerPool.on('error', () => {
    /* suppress connection terminated during container cleanup */
  });
  return {
    async $transaction<T>(
      fn: (tx: TransactionClient) => Promise<T>,
      _options?: { maxWait?: number; timeout?: number },
    ): Promise<T> {
      const conn = await innerPool.connect();
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
}
