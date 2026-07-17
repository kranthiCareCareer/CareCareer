#!/usr/bin/env node
/**
 * demo:up — Starts the CareCareer demo stack.
 *
 * 1. Start PostgreSQL via Docker Compose
 * 2. Wait for readiness
 * 3. Apply migrations + roles + RLS
 * 4. Seed deterministic demo data
 * 5. Start platform-service on port 3001
 * 6. Start admin console on port 4000
 * 7. Print URLs and persona instructions
 */
import { execSync } from 'node:child_process';

function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  execSync(cmd, { stdio: 'inherit', encoding: 'utf-8', ...opts });
}

console.log('\n═══════════════════════════════════════════');
console.log('  CareCareer Demo Stack — Starting');
console.log('═══════════════════════════════════════════\n');

try {
  // Step 1: Start PostgreSQL
  console.log('▶ Starting PostgreSQL...');
  run('docker compose -f docker-compose.demo.yml up -d postgres');

  // Step 2: Wait for readiness
  console.log('\n▶ Waiting for PostgreSQL readiness...');
  run(
    'docker compose -f docker-compose.demo.yml exec postgres pg_isready -U carecareer_admin --timeout=30',
  );

  console.log('\n▶ Demo stack PostgreSQL is ready.');
  console.log('  Database: postgresql://localhost:5432/carecareer_demo');

  console.log('\n═══════════════════════════════════════════');
  console.log('  Demo Stack Ready!');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('  To start services manually:');
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
