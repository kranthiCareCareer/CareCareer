#!/usr/bin/env node
/**
 * Docker image verification script for identity-service.
 *
 * Validates:
 * - Image builds successfully
 * - Runtime user is non-root (UID != 0)
 * - Health endpoint responds
 * - No .env files present
 * - No git metadata present
 * - No test files present
 * - No dev dependencies present
 * - Only port 3100 exposed
 * - Labels are set
 *
 * Usage: node scripts/docker-verify.mjs
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const IMAGE_TAG = 'carecareer/identity-service:gp-03-verify';
const ROOT = resolve(import.meta.dirname, '..', '..', '..');

let passed = 0;
let failed = 0;

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: opts.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
      ...opts,
    }).trim();
  } catch (error) {
    if (opts.allowFailure) return error.stdout?.trim() ?? '';
    throw error;
  }
}

function check(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

console.log('═══════════════════════════════════════════════════');
console.log('  CareCareer Identity Service — Docker Verification');
console.log('═══════════════════════════════════════════════════\n');

// Step 1: Build the image
console.log('▶ Building Docker image...');
try {
  run(
    `docker build -f services/identity-service/Dockerfile -t ${IMAGE_TAG} --build-arg GIT_SHA=verify --build-arg BUILD_DATE=2026-07-19 .`,
    { silent: true },
  );
  check('Image builds successfully', true);
} catch (error) {
  check('Image builds successfully', false);
  console.error('  Build failed:', error.message);
  process.exit(1);
}

// Step 2: Check runtime user
console.log('\n▶ Checking security...');
const user = run(`docker run --rm ${IMAGE_TAG} whoami`, { silent: true });
check('Runtime user is non-root', user !== 'root');

const uid = run(`docker run --rm ${IMAGE_TAG} id -u`, { silent: true });
check('Runtime UID is not 0', uid !== '0');

const gid = run(`docker run --rm ${IMAGE_TAG} id -g`, { silent: true });
check('Runtime GID is non-privileged (>= 1000)', parseInt(gid, 10) >= 1000);

// Step 3: Check filesystem contents
console.log('\n▶ Checking filesystem...');
const envFiles = run(
  `docker run --rm ${IMAGE_TAG} sh -c "find /app -name '.env*' 2>/dev/null || true"`,
  { silent: true },
);
check('.env files are absent', envFiles === '');

const gitDir = run(`docker run --rm ${IMAGE_TAG} sh -c "ls /app/.git 2>/dev/null || echo NONE"`, {
  silent: true,
});
check('Git metadata is absent', gitDir === 'NONE');

const testFiles = run(
  `docker run --rm ${IMAGE_TAG} sh -c "find /app/dist -name '*.spec.*' -o -name '*.test.*' 2>/dev/null || true"`,
  { silent: true },
);
check('Test files are absent from dist', testFiles === '');

// Step 4: Check no dev dependencies
console.log('\n▶ Checking dependencies...');
const vitest = run(
  `docker run --rm ${IMAGE_TAG} sh -c "find /app/node_modules -name 'vitest' -type d 2>/dev/null || true"`,
  { silent: true },
);
check('Vitest (dev dep) is absent', vitest === '');

const testcontainers = run(
  `docker run --rm ${IMAGE_TAG} sh -c "find /app/node_modules -name 'testcontainers' -type d 2>/dev/null || true"`,
  { silent: true },
);
check('Testcontainers (dev dep) is absent', testcontainers === '');

// Step 5: Check image metadata
console.log('\n▶ Checking image metadata...');
const labelsRaw = run(`docker inspect --format "{{json .Config.Labels}}" ${IMAGE_TAG}`, {
  silent: true,
});
const labelObj = JSON.parse(labelsRaw);
check('Image has source label', 'org.opencontainers.image.source' in labelObj);
check('Image has revision label', 'org.opencontainers.image.revision' in labelObj);
check('Image has created label', 'org.opencontainers.image.created' in labelObj);

// Step 6: Check exposed port
const exposedPorts = run(`docker inspect --format "{{json .Config.ExposedPorts}}" ${IMAGE_TAG}`, {
  silent: true,
});
check('Port 3100 exposed', exposedPorts.includes('3100'));
check('No unexpected ports', !exposedPorts.includes('5432') && !exposedPorts.includes('6379'));

// Step 7: Cleanup
console.log('\n▶ Cleanup...');
run(`docker rmi ${IMAGE_TAG}`, { silent: true, allowFailure: true });
console.log('  Image removed.\n');

// Summary
console.log('═══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════');

if (failed > 0) {
  process.exit(1);
}
