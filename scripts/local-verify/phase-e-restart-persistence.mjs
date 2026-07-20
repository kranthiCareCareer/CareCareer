#!/usr/bin/env node
/**
 * Phase E: Restart Persistence
 *
 * Exercises:
 * - /health and /ready after restart
 * - Data survives service restart (sessions, users persist in PostgreSQL)
 * - Cleanup (stop service, stop database)
 */
import { startPostgres, runMigrations, seedUser, startIdentityService } from './phase-a-orchestration.mjs';

const TEST_USER_ID = '10000000-0000-0000-0000-000000000005';

async function assertStatus(res, expected, context) {
  if (res.status !== expected) {
    const body = await res.text().catch(() => '');
    throw new Error(`${context}: expected ${expected}, got ${res.status}. Body: ${body.slice(0, 200)}`);
  }
}

async function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export async function runPhaseE() {
  console.log('  Phase E: Restart Persistence');
  const pg = await startPostgres();
  try {
    await runMigrations(pg.superUri);
    await seedUser(pg.superUri, TEST_USER_ID, 'persist@local.test', 'Persist User');

    // Start service, create session, stop service
    let sessionData;
    const svc1 = await startIdentityService(pg.superUri);
    try {
      const sRes = await fetch(`${svc1.baseUrl}/v1/auth/dev/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
      });
      await assertStatus(sRes, 201, 'Create session before restart');
      sessionData = await sRes.json();
      console.log('    ✓ Session created before restart');
    } finally {
      svc1.stop();
      // Wait for process to actually exit
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log('    ✓ Service stopped');

    // Restart service (same database)
    const svc2 = await startIdentityService(pg.superUri);
    try {
      // Health check
      const healthRes = await fetch(`${svc2.baseUrl}/health`);
      await assertStatus(healthRes, 200, '/health after restart');
      console.log('    ✓ /health passes after restart');

      // Readiness check
      const readyRes = await fetch(`${svc2.baseUrl}/ready`);
      await assertStatus(readyRes, 200, '/ready after restart');
      console.log('    ✓ /ready passes after restart');

      // Data survives: access token from before restart should still work
      // (because sessions are in PostgreSQL, which persisted across restart)
      const meRes = await fetch(`${svc2.baseUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${sessionData.accessToken}` },
      });
      await assertStatus(meRes, 200, '/me with pre-restart token');
      const me = await meRes.json();
      assert(me.data.userId === TEST_USER_ID, 'Data should survive restart');
      console.log('    ✓ Data survives restart (session still valid)');

      // Refresh also works after restart
      const refreshRes = await fetch(`${svc2.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: sessionData.refreshToken }),
      });
      await assertStatus(refreshRes, 200, 'Refresh after restart');
      console.log('    ✓ Refresh works after restart');
    } finally {
      svc2.stop();
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
    await runPhaseE();
    console.log('  ✓ Phase E passed\n');
  } catch (err) {
    console.error(`  ✗ Phase E FAILED: ${err.message}\n`);
    process.exit(1);
  }
}
