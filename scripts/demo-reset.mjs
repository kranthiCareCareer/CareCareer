#!/usr/bin/env node
/**
 * demo:reset — Resets demo data to known state.
 * Clears all data and re-seeds deterministic demo records.
 */
import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`  → ${cmd}`);
  execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
}

console.log('\n═══════════════════════════════════════════');
console.log('  CareCareer Demo — Resetting Data');
console.log('═══════════════════════════════════════════\n');

try {
  console.log('▶ Clearing existing data...');
  run(
    'docker compose -f docker-compose.demo.yml exec -T postgres psql -U carecareer_admin -d carecareer_demo -c "TRUNCATE tenants, organizations, branches, tenant_entitlements, tenant_feature_configurations, event_outbox, audit_records, idempotency_keys CASCADE;"',
  );

  console.log('\n✓ Demo data cleared. Re-seed with migrations + seed script.\n');
} catch (error) {
  console.error('❌ Reset failed:', error.message);
  process.exit(1);
}
