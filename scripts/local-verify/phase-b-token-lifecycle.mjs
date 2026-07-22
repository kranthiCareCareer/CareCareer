#!/usr/bin/env node
/**
 * Phase B: Token Lifecycle
 *
 * Exercises:
 * - RS256 session creation via dev endpoint
 * - /v1/auth/me with valid token
 * - JWKS endpoint verification
 * - Refresh rotation chain (A → B → C)
 * - Historical replay of A → AUTH_REFRESH_REPLAY
 * - Family compromise (C becomes unusable after replay)
 */
import {
  startPostgres,
  runMigrations,
  seedUser,
  startIdentityService,
} from './phase-a-orchestration.mjs';

const TEST_USER_ID = '10000000-0000-0000-0000-000000000001';

async function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function assertStatus(res, expected, context) {
  if (res.status !== expected) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `${context}: expected ${expected}, got ${res.status}. Body: ${body.slice(0, 200)}`,
    );
  }
}

export async function runPhaseB() {
  console.log('  Phase B: Token Lifecycle');
  const pg = await startPostgres();
  try {
    await runMigrations(pg.superUri);
    await seedUser(pg.superUri, TEST_USER_ID, 'verify@local.test', 'Verify User');

    const svc = await startIdentityService(pg.superUri);
    try {
      // 1. Create session via dev endpoint
      const sessionRes = await fetch(`${svc.baseUrl}/v1/auth/dev/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
      });
      await assertStatus(sessionRes, 201, 'Create session');
      const session = await sessionRes.json();
      assert(session.accessToken, 'Session should have accessToken');
      assert(session.refreshToken, 'Session should have refreshToken');
      assert(session.sessionId, 'Session should have sessionId');
      console.log('    ✓ RS256 session created');

      // 2. Access /me with valid token
      const meRes = await fetch(`${svc.baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      await assertStatus(meRes, 200, '/me with valid token');
      const me = await meRes.json();
      assert(me.data.userId === TEST_USER_ID, '/me should return correct userId');
      console.log('    ✓ /v1/auth/me returns authenticated user');

      // 3. JWKS endpoint
      const jwksRes = await fetch(`${svc.baseUrl}/.well-known/jwks.json`);
      await assertStatus(jwksRes, 200, 'JWKS endpoint');
      const jwks = await jwksRes.json();
      assert(jwks.keys.length > 0, 'JWKS should have at least one key');
      assert(jwks.keys[0].kty === 'RSA', 'Key type should be RSA');
      assert(jwks.keys[0].alg === 'RS256', 'Algorithm should be RS256');
      console.log('    ✓ JWKS endpoint returns RS256 key');

      // 4. Refresh A → B
      const refreshARes = await fetch(`${svc.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      await assertStatus(refreshARes, 200, 'Refresh A → B');
      const tokenB = await refreshARes.json();
      assert(tokenB.accessToken, 'Refresh should return new accessToken');
      assert(tokenB.refreshToken, 'Refresh should return new refreshToken');
      assert(tokenB.refreshToken !== session.refreshToken, 'New refresh token should differ');
      console.log('    ✓ Refresh A → B succeeded');

      // 5. Refresh B → C
      const refreshBRes = await fetch(`${svc.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokenB.refreshToken }),
      });
      await assertStatus(refreshBRes, 200, 'Refresh B → C');
      const tokenC = await refreshBRes.json();
      assert(tokenC.refreshToken !== tokenB.refreshToken, 'C should differ from B');
      console.log('    ✓ Refresh B → C succeeded');

      // 6. Replay A (historical) — should fail with AUTH_REFRESH_REPLAY
      const replayARes = await fetch(`${svc.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      await assertStatus(replayARes, 401, 'Replay A');
      const replayBody = await replayARes.json();
      assert(
        replayBody.code === 'AUTH_REFRESH_REPLAY' || replayBody.code === 'AUTH_REFRESH_COMPROMISED',
        `Replay should return AUTH_REFRESH_REPLAY or AUTH_REFRESH_COMPROMISED, got: ${replayBody.code}`,
      );
      console.log(`    ✓ Replay A detected (${replayBody.code})`);

      // 7. Family compromise — C should now be unusable
      const compromisedCRes = await fetch(`${svc.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokenC.refreshToken }),
      });
      await assertStatus(compromisedCRes, 401, 'Family compromise C');
      console.log('    ✓ Family compromise: C is unusable after replay');
    } finally {
      svc.stop();
    }
  } finally {
    pg.stop();
    console.log('    ✓ Cleanup complete');
  }
}

// Run if executed directly
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runPhaseB();
    console.log('  ✓ Phase B passed\n');
  } catch (err) {
    console.error(`  ✗ Phase B FAILED: ${err.message}\n`);
    process.exit(1);
  }
}
