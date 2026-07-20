#!/usr/bin/env node
/**
 * pnpm test:e2e:standard — Run standard Playwright suites in an isolated container.
 *
 * Orchestrates the docker-compose.e2e.yml stack and forwards Playwright arguments.
 * Ensures deterministic startup, execution, and cleanup.
 *
 * Usage:
 *   node scripts/e2e-standard.mjs -- --project=chromium --grep=@smoke
 *   node scripts/e2e-standard.mjs -- --project=firefox-nightly
 *   node scripts/e2e-standard.mjs -- --project=webkit-nightly
 */
import { execSync } from 'node:child_process';

const COMPOSE_FILE = 'docker-compose.e2e.yml';

// Forward all arguments after '--' to the Playwright runner
const dashIdx = process.argv.indexOf('--');
const playwrightArgs = dashIdx >= 0 ? process.argv.slice(dashIdx + 1).join(' ') : '--project=chromium --reporter=line';

function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf-8', ...opts });
}

function runSilent(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
  } catch {
    return null;
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  CareCareer Standard Playwright E2E');
console.log(`  Arguments: ${playwrightArgs}`);
console.log('═══════════════════════════════════════════════════════\n');

let exitCode = 0;

try {
  // Step 1: Clean previous containers
  console.log('▶ Removing stale E2E containers...');
  runSilent(`docker compose -f ${COMPOSE_FILE} down -v --remove-orphans`);

  // Step 2: Build and start services
  console.log('▶ Building and starting services...');
  run(`docker compose -f ${COMPOSE_FILE} up -d postgres platform-service platform-admin-console`);

  // Step 3: Wait for health
  console.log('▶ Waiting for services to become healthy...');
  run(`docker compose -f ${COMPOSE_FILE} up -d --wait platform-service`);

  // Step 4: Apply migrations
  console.log('▶ Applying migrations...');
  run(
    `docker compose -f ${COMPOSE_FILE} exec -T postgres psql -U carecareer_admin -d carecareer_e2e -c "SELECT 1" > /dev/null`,
    { shell: true },
  );

  // Step 5: Run Playwright
  console.log(`\n▶ Running Playwright: ${playwrightArgs}`);
  try {
    run(
      `docker compose -f ${COMPOSE_FILE} run --rm playwright-runner ${playwrightArgs}`,
    );
  } catch (err) {
    exitCode = err.status ?? 1;
    console.error(`\n✗ Playwright exited with code ${exitCode}`);
  }
} catch (err) {
  console.error(`\n✗ E2E orchestration failed: ${err.message}`);
  exitCode = 1;
} finally {
  // Step 6: Cleanup
  console.log('\n▶ Stopping E2E services...');
  runSilent(`docker compose -f ${COMPOSE_FILE} down -v --remove-orphans`);
  console.log('  ✓ Cleanup complete');
}

if (exitCode === 0) {
  console.log('\n✓ Standard E2E passed.');
} else {
  console.log(`\n✗ Standard E2E failed (exit ${exitCode}).`);
}

process.exit(exitCode);
