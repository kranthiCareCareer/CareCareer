#!/usr/bin/env node
/**
 * demo:up — Starts the CareCareer demo stack.
 *
 * 1. Start PostgreSQL via Docker Compose
 * 2. Wait for readiness (retry loop)
 * 3. Apply migrations + roles + RLS
 * 4. Print URLs and instructions
 */
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf-8', ...opts });
}

function runSilent(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  execSync(
    process.platform === 'win32'
      ? `ping -n ${Math.ceil(ms / 1000)} 127.0.0.1 > nul`
      : `sleep ${ms / 1000}`,
    { stdio: 'pipe' },
  );
}

console.log('\n═══════════════════════════════════════════');
console.log('  CareCareer Demo Stack — Starting');
console.log('═══════════════════════════════════════════\n');

try {
  // Step 0: Generate .env for local platform-service
  const envPath = resolve('services', 'platform-service', '.env');
  if (!existsSync(envPath)) {
    const envContent = [
      'DATABASE_URL=postgresql://carecareer_admin:demo_password_not_for_production@localhost:5432/carecareer_demo',
      'PORT=3001',
      'HOST=0.0.0.0',
      'NODE_ENV=development',
      'DEMO_MODE=true',
      'DEMO_AUTH_SECRET=carecareer-demo-secret-for-testing-only-do-not-use-in-production',
      '',
    ].join('\n');
    writeFileSync(envPath, envContent);
    console.log('▶ Generated platform-service .env for demo mode.');
  }

  // Step 1: Start PostgreSQL
  console.log('▶ Starting PostgreSQL...');
  run('docker compose -f docker-compose.demo.yml up -d postgres');

  // Step 2: Wait for readiness with retry
  console.log('\n▶ Waiting for PostgreSQL readiness...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (
      runSilent(
        'docker compose -f docker-compose.demo.yml exec -T postgres pg_isready -U carecareer_admin',
      )
    ) {
      ready = true;
      break;
    }
    sleep(1000);
  }
  if (!ready) {
    throw new Error('PostgreSQL did not become ready within 30 seconds');
  }
  console.log('  ✓ PostgreSQL is ready.');

  // Step 3: Apply migrations
  console.log('\n▶ Applying migrations...');
  run(
    'docker compose -f docker-compose.demo.yml exec -T postgres psql -U carecareer_admin -d carecareer_demo -f /dev/stdin < services/platform-service/prisma/migrations/001_initial_schema.sql',
    { shell: true },
  );
  console.log('  ✓ Migrations applied.');

  // Step 4: Create roles and grants
  console.log('\n▶ Creating roles and grants...');
  const rolesSql = `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_service') THEN
        CREATE ROLE app_service NOINHERIT LOGIN PASSWORD 'app_pw';
      END IF;
    END $$;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_records FROM app_service;
  `;
  execSync(
    `docker compose -f docker-compose.demo.yml exec -T postgres psql -U carecareer_admin -d carecareer_demo -c "${rolesSql.replace(/\n/g, ' ')}"`,
    { stdio: 'inherit', encoding: 'utf-8', shell: true },
  );
  console.log('  ✓ Roles and grants applied.');

  // Done
  console.log('\n═══════════════════════════════════════════');
  console.log('  Demo Stack Ready!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('  Start services:');
  console.log('    Platform Service:  pnpm --filter @carecareer/platform-service dev');
  console.log('    Admin Console:     pnpm --filter @carecareer/platform-admin-console dev');
  console.log('');
  console.log('  URLs:');
  console.log('    Platform API:      http://localhost:3001');
  console.log('    Admin Console:     http://localhost:4000');
  console.log('');
  console.log('  Personas:');
  console.log('    • Platform Administrator — full platform access');
  console.log('    • MAS Tenant Administrator — MAS tenant only');
  console.log('    • CareShield Tenant Administrator — CareShield tenant only');
  console.log('    • Read-Only Auditor — read-only access');
  console.log('');
} catch (error) {
  console.error('\n❌ Demo startup failed:', error.message);
  process.exit(1);
}
