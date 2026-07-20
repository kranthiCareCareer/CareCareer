#!/usr/bin/env node
/**
 * local:verify — Complete identity authentication lifecycle verification.
 *
 * Runs all phases sequentially:
 * - Phase A: Orchestration (start/stop PostgreSQL + identity service)
 * - Phase B: Token lifecycle (RS256, /me, JWKS, refresh chain, replay, compromise)
 * - Phase C: Session lifecycle (list, revoke, logout-all, immediate denial)
 * - Phase D: Authorization (suspend/reactivate user, cross-tenant denial)
 * - Phase E: Restart persistence (/health, /ready, data survives restart)
 *
 * Requires: Docker (for PostgreSQL container)
 */
import { runPhaseB } from './phase-b-token-lifecycle.mjs';
import { runPhaseC } from './phase-c-session-lifecycle.mjs';
import { runPhaseD } from './phase-d-authorization.mjs';
import { runPhaseE } from './phase-e-restart-persistence.mjs';

console.log('\n═══════════════════════════════════════════════════════');
console.log('  CareCareer Identity — Local HTTP Lifecycle Verification');
console.log('═══════════════════════════════════════════════════════\n');

const phases = [
  { name: 'B', fn: runPhaseB },
  { name: 'C', fn: runPhaseC },
  { name: 'D', fn: runPhaseD },
  { name: 'E', fn: runPhaseE },
];

let passed = 0;
let failed = 0;

for (const phase of phases) {
  try {
    await phase.fn();
    console.log(`  ✓ Phase ${phase.name} passed\n`);
    passed++;
  } catch (err) {
    console.error(`  ✗ Phase ${phase.name} FAILED: ${err.message}\n`);
    failed++;
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('  Verification Summary');
console.log('═══════════════════════════════════════════════════════');
console.log(`  ✓ ${passed} phases passed`);
if (failed > 0) {
  console.log(`  ✗ ${failed} phases FAILED`);
  process.exit(1);
} else {
  console.log('  ✓ All phases passed.');
}
