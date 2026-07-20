#!/usr/bin/env node
/**
 * Phase A: Orchestration
 *
 * Start/stop PostgreSQL (Testcontainers), run migrations, seed data,
 * start identity service, verify health, and cleanup.
 *
 * Exports orchestration helpers used by all subsequent phases.
 */
import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SERVICE_DIR = resolve(ROOT, 'services', 'identity-service');
const MIGRATIONS_DIR = resolve(SERVICE_DIR, 'prisma', 'migrations');

/**
 * Start PostgreSQL via Docker (simple container, not Testcontainers SDK).
 * Returns connection details and a stop function.
 */
export async function startPostgres() {
  const containerName = `carecareer-local-verify-${Date.now()}`;
  const port = 54320 + Math.floor(Math.random() * 100);
  const password = 'localverify';
  const database = 'identity_verify';

  execSync(
    `docker run -d --name ${containerName} ` +
    `-e POSTGRES_PASSWORD=${password} ` +
    `-e POSTGRES_DB=${database} ` +
    `-p ${port}:5432 ` +
    `postgres:16-alpine`,
    { stdio: 'pipe', encoding: 'utf-8' },
  );

  // Wait for PostgreSQL to be ready
  const superUri = `postgresql://postgres:${password}@localhost:${port}/${database}`;
  await waitForPostgres(superUri);

  return {
    containerName,
    port,
    superUri,
    appUri: `postgresql://carecareer_app:carecareer_app_dev@localhost:${port}/${database}`,
    stop: () => {
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'pipe' });
      } catch { /* ignore */ }
    },
  };
}

async function waitForPostgres(uri, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = new Client({ connectionString: uri });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('PostgreSQL did not become ready in time');
}

/**
 * Apply all identity service migrations.
 */
export async function runMigrations(superUri) {
  const client = new Client({ connectionString: superUri });
  await client.connect();
  try {
    const migrations = [
      '001_identity_schema.sql',
      '002_rls_and_grants.sql',
      '003_seed_roles_permissions.sql',
      '004_sessions_and_signing_keys.sql',
      '005_refresh_token_lineage.sql',
    ];
    for (const f of migrations) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

/**
 * Seed a test user and return their ID.
 */
export async function seedUser(superUri, userId, email, displayName) {
  const client = new Client({ connectionString: superUri });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO identity.users (id, display_name, primary_email, status, authorization_version, created_at, updated_at, version)
       VALUES ($1, $2, $3, 'ACTIVE', 1, NOW(), NOW(), 1)
       ON CONFLICT DO NOTHING`,
      [userId, displayName, email],
    );
  } finally {
    await client.end();
  }
}

/**
 * Start the identity service as a background process.
 * Returns the base URL and a stop function.
 */
export async function startIdentityService(databaseUrl, servicePort = 3199) {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    PORT: String(servicePort),
    HOST: '127.0.0.1',
    DEMO_MODE: 'false',
    SIGNING_PROVIDER: 'local-rs256',
  };

  const child = spawn('node', ['--import', 'tsx', 'src/main.ts'], {
    cwd: SERVICE_DIR,
    env,
    stdio: 'pipe',
  });

  const baseUrl = `http://127.0.0.1:${servicePort}`;

  // Wait for health endpoint
  await waitForHealth(baseUrl);

  return {
    baseUrl,
    child,
    stop: () => {
      child.kill('SIGTERM');
    },
  };
}

async function waitForHealth(baseUrl, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Identity service did not become healthy');
}

/**
 * Phase A self-test: start everything, verify health, stop.
 */
export async function runPhaseA() {
  console.log('  Phase A: Orchestration');
  const pg = await startPostgres();
  try {
    console.log(`    ✓ PostgreSQL started on port ${pg.port}`);
    await runMigrations(pg.superUri);
    console.log('    ✓ Migrations applied');

    const svc = await startIdentityService(pg.superUri);
    try {
      const healthRes = await fetch(`${svc.baseUrl}/health`);
      if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
      console.log('    ✓ Identity service healthy');

      const readyRes = await fetch(`${svc.baseUrl}/ready`);
      if (!readyRes.ok) throw new Error(`Readiness check failed: ${readyRes.status}`);
      console.log('    ✓ Identity service ready');
    } finally {
      svc.stop();
    }
  } finally {
    pg.stop();
    console.log('    ✓ Cleanup complete');
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runPhaseA();
    console.log('  ✓ Phase A passed\n');
  } catch (err) {
    console.error(`  ✗ Phase A FAILED: ${err.message}\n`);
    process.exit(1);
  }
}
