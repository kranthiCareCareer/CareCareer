#!/usr/bin/env node
/**
 * Phase C: Session Lifecycle
 *
 * Exercises:
 * - List sessions
 * - Revoke a specific session
 * - Logout all (revoke all sessions)
 * - Immediate denial after revocation
 */
import { startPostgres, runMigrations, seedUser, startIdentityService } from './phase-a-orchestration.mjs';

const TEST_USER_ID = '10000000-0000-0000-0000-000000000002';

async function assertStatus(res, expected, context) {
  if (res.status !== expected) {
    const body = await res.text().catch(() => '');
    throw new Error(`${context}: expected ${expected}, got ${res.status}. Body: ${body.slice(0, 200)}`);
  }
}

async function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export async function runPhaseC() {
  console.log('  Phase C: Session Lifecycle');
  const pg = await startPostgres();
  try {
    await runMigrations(pg.superUri);
    await seedUser(pg.superUri, TEST_USER_ID, 'session@local.test', 'Session User');

    const svc = await startIdentityService(pg.superUri);
    try {
      // Create two sessions
      const s1Res = await fetch(`${svc.baseUrl}/v1/auth/dev/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
      });
      await assertStatus(s1Res, 201, 'Create session 1');
      const s1 = await s1Res.json();

      const s2Res = await fetch(`${svc.baseUrl}/v1/auth/dev/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
      });
      await assertStatus(s2Res, 201, 'Create session 2');
      const s2 = await s2Res.json();
      console.log('    ✓ Two sessions created');

      // List sessions
      const listRes = await fetch(`${svc.baseUrl}/v1/auth/sessions`, {
        headers: { Authorization: `Bearer ${s1.accessToken}` },
      });
      await assertStatus(listRes, 200, 'List sessions');
      const sessions = await listRes.json();
      assert(sessions.data.length >= 2, `Should have at least 2 sessions, got ${sessions.data.length}`);
      console.log(`    ✓ Listed ${sessions.data.length} sessions`);

      // Revoke session 2
      const revokeRes = await fetch(`${svc.baseUrl}/v1/auth/sessions/${s2.sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${s1.accessToken}` },
      });
      await assertStatus(revokeRes, 200, 'Revoke session 2');
      console.log('    ✓ Session 2 revoked');

      // Session 2 token should be immediately denied
      const deniedRes = await fetch(`${svc.baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${s2.accessToken}` },
      });
      await assertStatus(deniedRes, 401, 'Session 2 denied after revocation');
      console.log('    ✓ Immediate denial after session revocation');

      // Session 1 should still work
      const s1StillWorksRes = await fetch(`${svc.baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${s1.accessToken}` },
      });
      await assertStatus(s1StillWorksRes, 200, 'Session 1 still works');
      console.log('    ✓ Session 1 still active');

      // Logout all
      const logoutAllRes = await fetch(`${svc.baseUrl}/v1/auth/logout-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s1.accessToken}` },
      });
      await assertStatus(logoutAllRes, 200, 'Logout all');
      const logoutAll = await logoutAllRes.json();
      assert(logoutAll.revokedCount >= 1, `Should revoke at least 1 session, got ${logoutAll.revokedCount}`);
      console.log(`    ✓ Logout-all revoked ${logoutAll.revokedCount} sessions`);

      // Session 1 refresh should now fail
      const refreshFailRes = await fetch(`${svc.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: s1.refreshToken }),
      });
      await assertStatus(refreshFailRes, 401, 'Refresh after logout-all');
      console.log('    ✓ Refresh denied after logout-all');
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
    await runPhaseC();
    console.log('  ✓ Phase C passed\n');
  } catch (err) {
    console.error(`  ✗ Phase C FAILED: ${err.message}\n`);
    process.exit(1);
  }
}
