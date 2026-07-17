#!/usr/bin/env node
/**
 * demo:verify — Full verification pipeline for DEMO-01.
 *
 * 1. Stop stale demo resources
 * 2. Start the demo stack
 * 3. Wait for readiness
 * 4. Run backend tests
 * 5. Run frontend unit tests
 * 6. Run Chromium E2E tests
 * 7. Save reports and artifacts
 * 8. Shut down transient resources
 * 9. Exit nonzero on any failure
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ARTIFACTS_DIR = resolve('artifacts', 'demo-screenshots');

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  → ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
    console.log(`  ✓ ${label} — passed`);
    return true;
  } catch {
    console.error(`  ✗ ${label} — FAILED`);
    return false;
  }
}

console.log('\n═══════════════════════════════════════════');
console.log('  CareCareer DEMO-01 Verification Pipeline');
console.log('═══════════════════════════════════════════\n');

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const results = [];

// Step 1: Stop stale resources
results.push(run('node scripts/demo-down.mjs', 'Stop stale demo resources'));

// Step 2: Start demo stack
results.push(run('node scripts/demo-up.mjs', 'Start demo stack'));

// Step 3: Run backend unit tests
results.push(run('pnpm --filter @carecareer/platform-service test', 'Platform service unit tests'));

// Step 4: Run frontend unit tests
results.push(run('pnpm --filter @carecareer/platform-admin-console test', 'Frontend unit tests'));

// Step 5: Run Chromium E2E tests
results.push(
  run('pnpm --filter @carecareer/platform-admin-console e2e', 'Chromium E2E tests'),
);

// Step 6: Shut down
run('node scripts/demo-down.mjs', 'Shut down demo resources');

// Report
console.log('\n═══════════════════════════════════════════');
console.log('  Verification Summary');
console.log('═══════════════════════════════════════════\n');

const steps = [
  'Stop stale resources',
  'Start demo stack',
  'Platform service tests',
  'Frontend unit tests',
  'Chromium E2E tests',
];

let failed = false;
results.forEach((pass, i) => {
  const status = pass ? '✓' : '✗';
  console.log(`  ${status} ${steps[i]}`);
  if (!pass) failed = true;
});

console.log('');

if (failed) {
  console.error('❌ Verification FAILED — see errors above.');
  process.exit(1);
} else {
  console.log('✅ All verification steps passed.');
  process.exit(0);
}
