#!/usr/bin/env node
/**
 * Verifies that the steering backup matches the canonical .kiro/steering/ files.
 * Fails with exit code 1 when any file differs.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const STEERING_DIR = join(ROOT, '.kiro', 'steering');
const BACKUP_DIR = join(ROOT, 'docs', 'project-memory', 'steering-backup');
const MANIFEST_PATH = join(BACKUP_DIR, 'MANIFEST.json');

if (!existsSync(MANIFEST_PATH)) {
  console.error('ERROR: MANIFEST.json not found. Run pnpm project-memory:sync first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
let failures = 0;

for (const entry of manifest.files) {
  const srcPath = join(ROOT, entry.source);
  if (!existsSync(srcPath)) {
    console.error(`FAIL MISSING: ${entry.source}`);
    failures++;
    continue;
  }
  const content = readFileSync(srcPath);
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (sha256 !== entry.sha256) {
    console.error(`FAIL CHANGED: ${entry.source} (backup is stale)`);
    failures++;
  } else {
    console.log(`PASS ${entry.source}`);
  }
}

if (failures > 0) {
  console.error(`\n✗ ${failures} file(s) differ. Run pnpm project-memory:sync to update.`);
  process.exit(1);
} else {
  console.log(`\n✓ All ${manifest.files.length} steering files verified.`);
}
