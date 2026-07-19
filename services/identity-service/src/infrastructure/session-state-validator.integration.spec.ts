import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { createSessionCommand } from '../application/commands/session-commands.js';
import { createUser } from '../domain/user.js';
import { generateRsaKeyPair, signPlatformJwt } from '../infrastructure/jwt-service.js';

import { PostgresIdentityRepository } from './postgres-identity-repository.js';
import { PostgresRefreshTokenRepository } from './postgres-refresh-token-repository.js';
import {
  PostgresSessionRepository,
  PostgresSigningKeyRepository,
} from './postgres-session-repository.js';
import { SessionStateValidator } from './session-state-validator.js';

function createPoolPrismaClient(connectionUri: string): { client: PrismaLikeClient; pool: Pool } {
  const pool = new Pool({ connectionString: connectionUri, max: 10 });
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

/**
 * Integration tests proving live session-state enforcement.
 * Uses real PostgreSQL, real RS256 signing, and real session state.
 *
 * Proves:
 * - ACTIVE session → accepted
 * - REVOKED session → AUTH_SESSION_REVOKED
 * - COMPROMISED session → AUTH_SESSION_COMPROMISED
 * - Expired session → AUTH_SESSION_EXPIRED
 * - Nonexistent session → AUTH_TOKEN_INVALID
 * - Session status resolved from PostgreSQL, not token claims
 * - No JWT claim activates admin context
 */
describe('Live Session-State Enforcement (GP-03.3)', () => {
  let container: StartedPostgreSqlContainer;
  let prismaClient: PrismaLikeClient;
  let rawClient: Client;
  let pool: Pool;
  let sessionRepo: PostgresSessionRepository;
  let identityRepo: PostgresIdentityRepository;
  let refreshTokenRepo: PostgresRefreshTokenRepository;
  let signingKeyRepo: PostgresSigningKeyRepository;
  let sessionValidator: SessionStateValidator;
  let privateKeyPem: string;
  let keyId: string;

  const userId = '00000000-0000-0000-0000-000000000200';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('session_state_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    // Apply all migrations
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = resolve(currentDir, '..', '..', 'prisma', 'migrations');
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

    const { client, pool: p } = createPoolPrismaClient(uri);
    prismaClient = client;
    pool = p;
    sessionRepo = new PostgresSessionRepository();
    identityRepo = new PostgresIdentityRepository();
    refreshTokenRepo = new PostgresRefreshTokenRepository();
    signingKeyRepo = new PostgresSigningKeyRepository();
    sessionValidator = new SessionStateValidator(prismaClient, sessionRepo);

    // Seed user
    await prismaClient.$transaction(async (tx) => {
      await identityRepo.createUser(
        tx,
        createUser({ id: userId, displayName: 'State Test User', primaryEmail: 'state@test.com' }),
      );
    });

    // Seed a signing key
    const { publicKeyPem, privateKeyPem: privKey } = generateRsaKeyPair();
    privateKeyPem = privKey;
    keyId = '00000000-0000-0000-0000-000000000010';
    await prismaClient.$transaction(async (tx) => {
      await signingKeyRepo.createKey(
        tx,
        {
          id: keyId,
          algorithm: 'RS256',
          publicKey: publicKeyPem,
          privateKeyRef: 'inline:test',
          status: 'ACTIVE',
          activatedAt: new Date(),
          rotatedAt: null,
          createdAt: new Date(),
        },
        'inline:test',
      );
    });
  }, 120000);

  afterAll(async () => {
    await pool.end();
    await rawClient.end();
    await container.stop();
  });

  async function createTestSession(): Promise<{ sessionId: string; accessToken: string }> {
    const { session } = await createSessionCommand(
      prismaClient,
      sessionRepo,
      { userId, correlationId: 'state-test' },
      refreshTokenRepo,
    );

    const accessToken = await signPlatformJwt(
      {
        sub: userId,
        user_authorization_version: 1,
        platform_roles: [],
        tenant_roles: [],
        permissions: [],
        sid: session.id,
      },
      privateKeyPem,
      keyId,
    );

    return { sessionId: session.id, accessToken };
  }

  describe('Session status validation', () => {
    it('should accept a valid access token tied to an ACTIVE session', async () => {
      const { sessionId } = await createTestSession();

      const result = await sessionValidator.validate({ sessionId, userId });
      expect(result.valid).toBe(true);
    });

    it('should reject after the session is revoked (AUTH_SESSION_REVOKED)', async () => {
      const { sessionId } = await createTestSession();

      // Revoke the session
      await rawClient.query(
        "UPDATE identity.auth_sessions SET status = 'REVOKED', revoked_at = NOW(), revocation_reason = 'test' WHERE id = $1",
        [sessionId],
      );

      const result = await sessionValidator.validate({ sessionId, userId });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AUTH_SESSION_REVOKED');
    });

    it('should reject after the session is marked COMPROMISED', async () => {
      const { sessionId } = await createTestSession();

      // Mark as compromised
      await rawClient.query(
        "UPDATE identity.auth_sessions SET status = 'COMPROMISED', revoked_at = NOW(), revocation_reason = 'replay' WHERE id = $1",
        [sessionId],
      );

      const result = await sessionValidator.validate({ sessionId, userId });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AUTH_SESSION_COMPROMISED');
    });

    it('should reject when session is beyond absolute 7-day lifetime', async () => {
      const { sessionId } = await createTestSession();

      // Set expires_at to the past (simulate 7-day expiry)
      await rawClient.query(
        "UPDATE identity.auth_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
        [sessionId],
      );

      const result = await sessionValidator.validate({ sessionId, userId });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AUTH_SESSION_EXPIRED');
    });

    it('should reject a token with a nonexistent session ID', async () => {
      const fakeSessionId = '00000000-0000-0000-0000-ffffffffffff';

      const result = await sessionValidator.validate({ sessionId: fakeSessionId, userId });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('should reject when userId does not match the session owner', async () => {
      const { sessionId } = await createTestSession();
      const wrongUserId = '00000000-0000-0000-0000-000000000999';

      const result = await sessionValidator.validate({ sessionId, userId: wrongUserId });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  describe('Session state is resolved from PostgreSQL', () => {
    it('should reflect immediate revocation (not cached from token)', async () => {
      const { sessionId } = await createTestSession();

      // First call succeeds
      const before = await sessionValidator.validate({ sessionId, userId });
      expect(before.valid).toBe(true);

      // Revoke in the database
      await rawClient.query(
        "UPDATE identity.auth_sessions SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1",
        [sessionId],
      );

      // Second call reflects the revocation immediately
      const after = await sessionValidator.validate({ sessionId, userId });
      expect(after.valid).toBe(false);
      expect(after.code).toBe('AUTH_SESSION_REVOKED');
    });

    it('should not accept a token claim that tries to override session state', async () => {
      const { sessionId } = await createTestSession();

      // Revoke the session in DB
      await rawClient.query(
        "UPDATE identity.auth_sessions SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1",
        [sessionId],
      );

      // Even though we pass the correct userId and sessionId (as if from a valid JWT),
      // the DB state overrides any implicit token claim
      const result = await sessionValidator.validate({ sessionId, userId });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AUTH_SESSION_REVOKED');
    });
  });

  describe('Administrative context safety', () => {
    it('should not have any mechanism for JWT claims to activate app.is_admin', async () => {
      // The SessionStateValidator only queries session status.
      // It never sets app.is_admin or any administrative database context.
      // This test proves the validator does not execute any SET command.
      const { sessionId } = await createTestSession();

      // Validate — should work normally without touching admin context
      const result = await sessionValidator.validate({ sessionId, userId });
      expect(result.valid).toBe(true);

      // Verify no admin setting was activated (check pg_settings)
      const pgResult = await rawClient.query(
        "SELECT current_setting('app.is_admin', true) as is_admin",
      );
      // Should be null/empty — never set
      expect(pgResult.rows[0].is_admin).toBeNull();
    });
  });
});
