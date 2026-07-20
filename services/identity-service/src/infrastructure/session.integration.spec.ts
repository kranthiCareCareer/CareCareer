import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import {
  createSessionCommand,
  logoutAllCommand,
  logoutCommand,
  refreshSessionCommand,
  RefreshError,
} from '../application/commands/session-commands.js';
import { hashToken } from '../domain/session.js';
import { createUser } from '../domain/user.js';

import { PostgresIdentityRepository } from './postgres-identity-repository.js';
import { PostgresMembershipRepository } from './postgres-membership-repository.js';
import { PostgresRefreshTokenRepository } from './postgres-refresh-token-repository.js';
import { PostgresSessionRepository } from './postgres-session-repository.js';

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

describe('Session Integration Tests (GP-03.3 — Durable Lineage)', () => {
  let container: StartedPostgreSqlContainer;
  let prismaClient: PrismaLikeClient;
  let rawClient: Client;
  let pool: Pool;
  let sessionRepo: PostgresSessionRepository;
  let identityRepo: PostgresIdentityRepository;
  let refreshTokenRepo: PostgresRefreshTokenRepository;
  let membershipRepo: PostgresMembershipRepository;

  const userId = '00000000-0000-0000-0000-000000000100';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('session_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();

    const uri = container.getConnectionUri();
    rawClient = new Client({ connectionString: uri });
    await rawClient.connect();

    // Apply all migrations including the new lineage table
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
    membershipRepo = new PostgresMembershipRepository();

    // Seed a user for session tests
    await prismaClient.$transaction(async (tx) => {
      await identityRepo.createUser(
        tx,
        createUser({ id: userId, displayName: 'Session User', primaryEmail: 'session@test.com' }),
      );
    });
  }, 120000);

  afterAll(async () => {
    await pool.end();
    await rawClient.end();
    await container.stop();
  });

  describe('Session creation with lineage', () => {
    it('should create a session with audit, outbox, and refresh token lineage atomically', async () => {
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-create-1' },
        refreshTokenRepo,
      );

      expect(session.status).toBe('ACTIVE');
      expect(session.userId).toBe(userId);
      expect(refreshToken.length).toBeGreaterThan(20);

      // Verify refresh token lineage record exists
      const lineage = await rawClient.query(
        'SELECT * FROM identity.auth_refresh_tokens WHERE session_id = $1',
        [session.id],
      );
      expect(lineage.rows).toHaveLength(1);
      expect(lineage.rows[0].status).toBe('ACTIVE');
      expect(lineage.rows[0].token_hash).toBe(hashToken(refreshToken));
      expect(lineage.rows[0].parent_token_id).toBeNull();

      // Verify audit record exists
      const audit = await rawClient.query(
        "SELECT id FROM identity.audit_records WHERE action = 'identity.session.created' AND correlation_id = 'test-create-1'",
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);

      // Verify outbox event exists
      const outbox = await rawClient.query(
        "SELECT id FROM identity.event_outbox WHERE event_type = 'identity.session.created' AND correlation_id = 'test-create-1'",
      );
      expect(outbox.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should not store raw refresh tokens in the database', async () => {
      const { refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-raw-check' },
        refreshTokenRepo,
      );

      // The raw token itself should NOT match any stored hash
      const result = await rawClient.query(
        'SELECT * FROM identity.auth_refresh_tokens WHERE token_hash = $1',
        [refreshToken],
      );
      expect(result.rows).toHaveLength(0);

      // The SHA-256 hash should be stored
      const hashResult = await rawClient.query(
        'SELECT * FROM identity.auth_refresh_tokens WHERE token_hash = $1',
        [hashToken(refreshToken)],
      );
      expect(hashResult.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Refresh rotation with lineage', () => {
    it('should rotate the refresh token and track lineage', async () => {
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-rotate-1' },
        refreshTokenRepo,
      );

      const { newRefreshToken } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken, correlationId: 'test-rotate-2' },
        refreshTokenRepo,
      );

      expect(newRefreshToken).not.toBe(refreshToken);

      // Verify lineage: original token is now ROTATED, successor is ACTIVE
      const tokens = await rawClient.query(
        'SELECT * FROM identity.auth_refresh_tokens WHERE session_id = $1 ORDER BY issued_at ASC',
        [session.id],
      );
      expect(tokens.rows).toHaveLength(2);
      expect(tokens.rows[0].status).toBe('ROTATED');
      expect(tokens.rows[0].token_hash).toBe(hashToken(refreshToken));
      expect(tokens.rows[1].status).toBe('ACTIVE');
      expect(tokens.rows[1].token_hash).toBe(hashToken(newRefreshToken));
      expect(tokens.rows[1].parent_token_id).toBe(tokens.rows[0].id);
    });

    it('should not extend absolute session expiration on refresh', async () => {
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-no-extend-1' },
        refreshTokenRepo,
      );

      const originalExpiry = session.expiresAt.getTime();

      const { session: refreshedSession } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken, correlationId: 'test-no-extend-2' },
        refreshTokenRepo,
      );

      // Expiry should remain the same (7 days from creation, not from refresh)
      expect(refreshedSession.expiresAt.getTime()).toBe(originalExpiry);
    });
  });

  describe('Historical replay detection', () => {
    it('should detect replay of token A after A→B rotation and compromise family', async () => {
      const { session, refreshToken: tokenA } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'replay-create' },
        refreshTokenRepo,
      );

      // A rotates to B
      const { newRefreshToken: tokenB } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken: tokenA, correlationId: 'replay-rotate-ab' },
        refreshTokenRepo,
      );

      // Replay A → must return AUTH_REFRESH_REPLAY
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenA, correlationId: 'replay-attack-a' },
          refreshTokenRepo,
        );
        expect.fail('Should have thrown AUTH_REFRESH_REPLAY');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_REFRESH_REPLAY');
      }

      // Verify family is compromised
      const tokens = await rawClient.query(
        'SELECT * FROM identity.auth_refresh_tokens WHERE session_id = $1 ORDER BY issued_at ASC',
        [session.id],
      );
      for (const t of tokens.rows) {
        expect(t.status).toBe('COMPROMISED');
      }

      // Token B must also be unusable
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenB, correlationId: 'replay-b-after' },
          refreshTokenRepo,
        );
        expect.fail('Token B should be unusable after family compromise');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        // B is COMPROMISED, not ROTATED, so it returns INVALID not REPLAY
        expect((error as RefreshError).code).toBe('AUTH_REFRESH_INVALID');
      }

      // Verify audit record for family compromise
      const audit = await rawClient.query(
        "SELECT * FROM identity.audit_records WHERE action = 'identity.session.family-compromised' AND correlation_id = 'replay-attack-a'",
      );
      expect(audit.rows.length).toBe(1);
      // Audit must not contain any token hash
      const auditSummary = audit.rows[0].after_summary;
      expect(JSON.stringify(auditSummary)).not.toContain(hashToken(tokenA));
      expect(JSON.stringify(auditSummary)).not.toContain(hashToken(tokenB));

      // Verify outbox event for family compromise
      const outbox = await rawClient.query(
        "SELECT * FROM identity.event_outbox WHERE event_type = 'identity.session.family-compromised' AND correlation_id = 'replay-attack-a'",
      );
      expect(outbox.rows.length).toBe(1);
      // Outbox must not contain any token hash
      const outboxPayload = outbox.rows[0].payload;
      expect(JSON.stringify(outboxPayload)).not.toContain(hashToken(tokenA));
      expect(JSON.stringify(outboxPayload)).not.toContain(hashToken(tokenB));
    });

    it('should detect replay of token B after A→B→C rotation', async () => {
      const { refreshToken: tokenA } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'replay-abc-create' },
        refreshTokenRepo,
      );

      // A → B
      const { newRefreshToken: tokenB } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken: tokenA, correlationId: 'replay-abc-ab' },
        refreshTokenRepo,
      );

      // B → C
      const { newRefreshToken: tokenC } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken: tokenB, correlationId: 'replay-abc-bc' },
        refreshTokenRepo,
      );

      // Replay B → must detect as AUTH_REFRESH_REPLAY
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenB, correlationId: 'replay-abc-b-attack' },
          refreshTokenRepo,
        );
        expect.fail('Should have thrown AUTH_REFRESH_REPLAY');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_REFRESH_REPLAY');
      }

      // Token C must be unusable (family compromised)
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenC, correlationId: 'replay-abc-c-after' },
          refreshTokenRepo,
        );
        expect.fail('Token C should be unusable after family compromise');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_REFRESH_INVALID');
      }

      // No new tokens were issued
      // Verify only the 3 original tokens exist for this family
      const tokenAHash = hashToken(tokenA);
      const familyResult = await rawClient.query(
        'SELECT token_family_id FROM identity.auth_refresh_tokens WHERE token_hash = $1',
        [tokenAHash],
      );
      const familyId = familyResult.rows[0].token_family_id;
      const allTokens = await rawClient.query(
        'SELECT * FROM identity.auth_refresh_tokens WHERE token_family_id = $1',
        [familyId],
      );
      expect(allTokens.rows).toHaveLength(3); // A, B, C — no new token issued
    });

    it('should reject an unknown random token as AUTH_REFRESH_INVALID (not REPLAY)', async () => {
      const unknownToken = 'completely-random-token-that-never-existed';

      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: unknownToken, correlationId: 'unknown-token' },
          refreshTokenRepo,
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_REFRESH_INVALID');
      }
    });
  });

  describe('Concurrent refresh safety', () => {
    it('should prevent two valid successors from one refresh token', async () => {
      // Clean start
      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'conc-clean' },
        refreshTokenRepo,
      );

      const { refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'conc-create' },
        refreshTokenRepo,
      );

      // Launch two concurrent refreshes with the same token
      const [result1, result2] = await Promise.allSettled([
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'conc-1' },
          refreshTokenRepo,
        ),
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'conc-2' },
          refreshTokenRepo,
        ),
      ]);

      // At most one should succeed
      const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
      const failures = [result1, result2].filter((r) => r.status === 'rejected');

      // Under FOR UPDATE locking: one wins, the other either:
      // - waits and finds the token ROTATED (replay), or
      // - serialization failure
      expect(successes.length).toBeLessThanOrEqual(1);
      expect(failures.length).toBeGreaterThanOrEqual(1);

      // If one succeeded, the failure should be a replay or serialization error
      if (successes.length === 1 && failures.length === 1) {
        const failedResult = failures[0] as PromiseRejectedResult;
        const failError = failedResult.reason as RefreshError;
        // After FOR UPDATE lock release, the second caller sees ROTATED status → REPLAY
        expect(
          failError.code === 'AUTH_REFRESH_REPLAY' || failError.code === 'AUTH_REFRESH_INVALID',
        ).toBe(true);
      }

      // Verify no duplicate active refresh hashes in the lineage table
      const activeTokens = await rawClient.query(
        "SELECT token_hash FROM identity.auth_refresh_tokens WHERE status = 'ACTIVE'",
      );
      const hashes = activeTokens.rows.map((r: Record<string, unknown>) => r['token_hash']);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });

    it('should ensure deterministic outcome: family compromised after concurrent replay', async () => {
      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'conc2-clean' },
        refreshTokenRepo,
      );

      const { refreshToken: tokenA } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'conc2-create' },
        refreshTokenRepo,
      );

      // Rotate A → B
      const { newRefreshToken: tokenB } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken: tokenA, correlationId: 'conc2-rotate' },
        refreshTokenRepo,
      );

      // Now replay A concurrently (both are replay attempts)
      const [r1, r2] = await Promise.allSettled([
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenA, correlationId: 'conc2-replay-1' },
          refreshTokenRepo,
        ),
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenA, correlationId: 'conc2-replay-2' },
          refreshTokenRepo,
        ),
      ]);

      // Both must fail — one as REPLAY, the other as REPLAY or INVALID
      expect(r1.status).toBe('rejected');
      expect(r2.status).toBe('rejected');

      // At least one should be AUTH_REFRESH_REPLAY
      const errors = [r1, r2]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason as RefreshError).code);
      expect(errors.some((code) => code === 'AUTH_REFRESH_REPLAY')).toBe(true);

      // Token B must be unusable after compromise
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: tokenB, correlationId: 'conc2-b-after' },
          refreshTokenRepo,
        );
        expect.fail('Token B should be unusable');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        // B could be COMPROMISED or the session itself is COMPROMISED
        const code = (error as RefreshError).code;
        expect(code === 'AUTH_REFRESH_INVALID' || code === 'AUTH_SESSION_EXPIRED').toBe(true);
      }
    });
  });

  describe('Logout with lineage', () => {
    it('should revoke a session and its token lineage on logout', async () => {
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-logout-1' },
        refreshTokenRepo,
      );

      await logoutCommand(
        prismaClient,
        sessionRepo,
        { sessionId: session.id, userId, correlationId: 'test-logout-2' },
        refreshTokenRepo,
      );

      // Refresh should fail
      await expect(
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'test-logout-3' },
          refreshTokenRepo,
        ),
      ).rejects.toThrow();

      // Verify lineage tokens are revoked
      const tokens = await rawClient.query(
        'SELECT status FROM identity.auth_refresh_tokens WHERE session_id = $1',
        [session.id],
      );
      for (const t of tokens.rows) {
        expect(t.status).toBe('REVOKED');
      }
    });

    it('should be idempotent (repeated logout succeeds)', async () => {
      const { session } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-idem-logout-1' },
        refreshTokenRepo,
      );

      await logoutCommand(
        prismaClient,
        sessionRepo,
        { sessionId: session.id, userId, correlationId: 'test-idem-logout-2' },
        refreshTokenRepo,
      );

      // Second logout should not throw
      await logoutCommand(
        prismaClient,
        sessionRepo,
        { sessionId: session.id, userId, correlationId: 'test-idem-logout-3' },
        refreshTokenRepo,
      );
    });

    it('should revoke all sessions and lineage on logout-all', async () => {
      // Create multiple sessions
      const s1 = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'la-1' },
        refreshTokenRepo,
      );
      const s2 = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'la-2' },
        refreshTokenRepo,
      );

      const count = await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'test-logout-all' },
        refreshTokenRepo,
      );

      expect(count).toBeGreaterThanOrEqual(2);

      // Both refresh tokens should fail
      await expect(
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: s1.refreshToken, correlationId: 'la-fail-1' },
          refreshTokenRepo,
        ),
      ).rejects.toThrow();

      await expect(
        refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken: s2.refreshToken, correlationId: 'la-fail-2' },
          refreshTokenRepo,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Five-session limit', () => {
    it('should enforce maximum 5 active sessions (oldest revoked at limit)', async () => {
      // Clean slate: revoke all
      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'limit-clean' },
        refreshTokenRepo,
      );

      // Create 5 sessions
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const s = await createSessionCommand(
          prismaClient,
          sessionRepo,
          { userId, correlationId: `limit-${i}` },
          refreshTokenRepo,
        );
        sessions.push(s);
      }

      // Create 6th — should succeed but oldest is revoked
      const sixth = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'limit-6th' },
        refreshTokenRepo,
      );
      expect(sixth.session.status).toBe('ACTIVE');

      // Count active sessions
      const activeCount = await prismaClient.$transaction(async (tx) => {
        return sessionRepo.countActiveUserSessions(tx, userId);
      });
      expect(activeCount).toBeLessThanOrEqual(5);
    });
  });

  describe('Transaction atomicity', () => {
    it('should rollback session + lineage + audit + outbox on failure', async () => {
      const badUserId = '00000000-0000-0000-0000-ffffffffffff';

      // Creating a session for non-existent user should fail on FK constraint
      await expect(
        createSessionCommand(
          prismaClient,
          sessionRepo,
          { userId: badUserId, correlationId: 'test-atomicity-fail' },
          refreshTokenRepo,
        ),
      ).rejects.toThrow();

      // Verify no partial records exist
      const sessions = await rawClient.query(
        'SELECT id FROM identity.auth_sessions WHERE user_id = $1',
        [badUserId],
      );
      expect(sessions.rows).toHaveLength(0);

      // No lineage tokens created
      const tokens = await rawClient.query(
        'SELECT id FROM identity.auth_refresh_tokens WHERE token_family_id IN (SELECT token_family FROM identity.auth_sessions WHERE user_id = $1)',
        [badUserId],
      );
      expect(tokens.rows).toHaveLength(0);
    });
  });

  describe('Authorization-version enforcement', () => {
    it('should reject refresh when user is suspended', async () => {
      // Clean and create fresh session
      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'av-clean' },
        refreshTokenRepo,
      );
      const { refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'av-create' },
        refreshTokenRepo,
      );

      // Suspend the user
      await prismaClient.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE identity.users SET status = 'SUSPENDED', authorization_version = authorization_version + 1
          WHERE id = ${userId}
        `;
      });

      // Refresh should fail because user is suspended
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'av-suspended' },
          refreshTokenRepo,
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_USER_SUSPENDED');
      }

      // Restore user for other tests
      await prismaClient.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE identity.users SET status = 'ACTIVE' WHERE id = ${userId}
        `;
      });
    });

    it('should reject refresh when user is deactivated', async () => {
      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'av-clean2' },
        refreshTokenRepo,
      );
      const { refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'av-create2' },
        refreshTokenRepo,
      );

      // Deactivate the user
      await prismaClient.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE identity.users SET status = 'DEACTIVATED', authorization_version = authorization_version + 1
          WHERE id = ${userId}
        `;
      });

      // Refresh should fail
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'av-deactivated' },
          refreshTokenRepo,
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_USER_DEACTIVATED');
      }

      // Restore
      await prismaClient.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE identity.users SET status = 'ACTIVE' WHERE id = ${userId}
        `;
      });
    });
  });

  describe('Membership authorization-version enforcement', () => {
    const tenantId = '00000000-0000-0000-0000-000000000900';
    const membershipId = '00000000-0000-0000-0000-000000000901';

    it('should reject refresh when membership is SUSPENDED', async () => {
      // Seed a membership
      await rawClient.query(
        `INSERT INTO identity.tenant_memberships (id, user_id, tenant_id, status, authorization_version, created_at, updated_at, version)
         VALUES ($1, $2, $3, 'SUSPENDED', 1, NOW(), NOW(), 1)
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET status = 'SUSPENDED'`,
        [membershipId, userId, tenantId],
      );

      // Create session and link it to the membership
      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'ms-clean' },
        refreshTokenRepo,
      );
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'ms-create' },
        refreshTokenRepo,
      );

      // Set membership_id on the session
      await rawClient.query(
        'UPDATE identity.auth_sessions SET membership_id = $1, membership_authorization_version = 1 WHERE id = $2',
        [membershipId, session.id],
      );

      // Refresh should fail because membership is suspended
      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'ms-suspended' },
          refreshTokenRepo,
          membershipRepo,
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_MEMBERSHIP_SUSPENDED');
      }
    });

    it('should reject refresh when membership is DEACTIVATED', async () => {
      // Update membership to DEACTIVATED
      await rawClient.query(
        `UPDATE identity.tenant_memberships SET status = 'DEACTIVATED' WHERE id = $1`,
        [membershipId],
      );

      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'md-clean' },
        refreshTokenRepo,
      );
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'md-create' },
        refreshTokenRepo,
      );

      await rawClient.query(
        'UPDATE identity.auth_sessions SET membership_id = $1, membership_authorization_version = 1 WHERE id = $2',
        [membershipId, session.id],
      );

      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'md-deactivated' },
          refreshTokenRepo,
          membershipRepo,
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_MEMBERSHIP_DEACTIVATED');
      }
    });

    it('should reject refresh when membership authorization version is stale', async () => {
      // Update membership to ACTIVE with version 5
      await rawClient.query(
        `UPDATE identity.tenant_memberships SET status = 'ACTIVE', authorization_version = 5 WHERE id = $1`,
        [membershipId],
      );

      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'mv-clean' },
        refreshTokenRepo,
      );
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'mv-create' },
        refreshTokenRepo,
      );

      // Session has stale version 1, membership is at 5
      await rawClient.query(
        'UPDATE identity.auth_sessions SET membership_id = $1, membership_authorization_version = 1 WHERE id = $2',
        [membershipId, session.id],
      );

      try {
        await refreshSessionCommand(
          prismaClient,
          sessionRepo,
          identityRepo,
          { refreshToken, correlationId: 'mv-stale' },
          refreshTokenRepo,
          membershipRepo,
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error as RefreshError).code).toBe('AUTH_MEMBERSHIP_VERSION_STALE');
      }
    });

    it('should accept refresh when membership is ACTIVE with matching version', async () => {
      // Update membership to ACTIVE with version 5
      await rawClient.query(
        `UPDATE identity.tenant_memberships SET status = 'ACTIVE', authorization_version = 5 WHERE id = $1`,
        [membershipId],
      );

      await logoutAllCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'ma-clean' },
        refreshTokenRepo,
      );
      const { session, refreshToken } = await createSessionCommand(
        prismaClient,
        sessionRepo,
        { userId, correlationId: 'ma-create' },
        refreshTokenRepo,
      );

      // Session has matching version 5
      await rawClient.query(
        'UPDATE identity.auth_sessions SET membership_id = $1, membership_authorization_version = 5 WHERE id = $2',
        [membershipId, session.id],
      );

      // Should succeed
      const { newRefreshToken } = await refreshSessionCommand(
        prismaClient,
        sessionRepo,
        identityRepo,
        { refreshToken, correlationId: 'ma-success' },
        refreshTokenRepo,
        membershipRepo,
      );
      expect(newRefreshToken).toBeTruthy();
    });
  });

  describe('Membership not-found handling', () => {
    it('should reject refresh when membership ID does not exist', async () => {
      const nonexistentMembershipId = '00000000-0000-0000-0000-000000000999';

      await logoutAllCommand(prismaClient, sessionRepo, { userId, correlationId: 'mnf-clean' }, refreshTokenRepo);
      const { session, refreshToken } = await createSessionCommand(prismaClient, sessionRepo, { userId, correlationId: 'mnf-create' }, refreshTokenRepo);

      await rawClient.query('UPDATE identity.auth_sessions SET membership_id = $1, membership_authorization_version = 1 WHERE id = $2', [nonexistentMembershipId, session.id]);

      try {
        await refreshSessionCommand(prismaClient, sessionRepo, identityRepo, { refreshToken, correlationId: 'mnf-refresh' }, refreshTokenRepo, membershipRepo);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RefreshError);
        expect((error).code).toBe('AUTH_MEMBERSHIP_INVALID');
      }
    });
  });
});
