#!/usr/bin/env node
/**
 * Syncs .kiro/steering/*.md files into docs/project-memory/steering-backup/
 * and generates a MANIFEST.json with SHA-256 hashes for verification.
 */
import { readdirSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const STEERING_DIR = join(ROOT, '.kiro', 'steering');
const BACKUP_DIR = join(ROOT, 'docs', 'project-memory', 'steering-backup');
const MANIFEST_PATH = join(BACKUP_DIR, 'MANIFEST.json');

mkdirSync(BACKUP_DIR, { recursive: true });

const files = readdirSync(STEERING_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceDir: '.kiro/steering/',
  backupDir: 'docs/project-memory/steering-backup/',
  files: [],
};

for (const file of files) {
  const srcPath = join(STEERING_DIR, file);
  const destPath = join(BACKUP_DIR, file);
  const content = readFileSync(srcPath);
  const sha256 = createHash('sha256').update(content).digest('hex');

  copyFileSync(srcPath, destPath);

  manifest.files.push({
    source: `.kiro/steering/${file}`,
    backup: `docs/project-memory/steering-backup/${file}`,
    sha256,
    bytes: content.length,
  });
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(`✓ Synced ${files.length} steering files to backup.`);
console.log(`  Manifest: ${MANIFEST_PATH}`);
