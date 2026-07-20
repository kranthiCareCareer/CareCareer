#!/usr/bin/env node
/**
 * GP-03.3 Security Coverage Gate
 * Reads coverage-summary.json and enforces per-file thresholds
 * for security-critical modules.
 *
 * Run after: pnpm test:coverage
 * Fail on: any required file below threshold or missing from report
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const summaryPath = resolve(__dirname, '..', 'coverage', 'coverage-summary.json');

if (!existsSync(summaryPath)) {
  console.error('ERROR: coverage/coverage-summary.json not found. Run pnpm test:coverage first.');
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

/**
 * Security-critical modules and their required thresholds.
 * These are the approved CareCareer GP-03.3 security thresholds.
 */
const SECURITY_THRESHOLDS = [
  { pattern: 'platform-token-validator.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'identity-auth.guard.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'session-state-validator.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'session-commands.ts', lines: 95, branches: 88, functions: 95, stmts: 95 },
  { pattern: 'postgres-session-repository.ts', lines: 95, branches: 85, functions: 95, stmts: 95 },
  { pattern: 'postgres-refresh-token-repository.ts', lines: 95, branches: 85, functions: 95, stmts: 95 },
  { pattern: 'identity-config.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
];

const GLOBAL_THRESHOLDS = { lines: 85, branches: 80, functions: 85, stmts: 85 };

let exitCode = 0;

// Check global thresholds
const total = summary['total'];
if (total) {
  const checks = [
    { name: 'Global statements', pct: total.statements.pct, required: GLOBAL_THRESHOLDS.stmts },
    { name: 'Global lines', pct: total.lines.pct, required: GLOBAL_THRESHOLDS.lines },
    { name: 'Global functions', pct: total.functions.pct, required: GLOBAL_THRESHOLDS.functions },
    { name: 'Global branches', pct: total.branches.pct, required: GLOBAL_THRESHOLDS.branches },
  ];
  for (const check of checks) {
    if (check.pct < check.required) {
      console.error(`FAIL ${check.name}: ${check.pct}% < ${check.required}% required`);
      exitCode = 1;
    } else {
      console.log(`PASS ${check.name}: ${check.pct}%`);
    }
  }
}

// Check per-file security thresholds
const files = Object.keys(summary).filter((k) => k !== 'total');

for (const threshold of SECURITY_THRESHOLDS) {
  const matchingFile = files.find((f) => f.endsWith(threshold.pattern));
  if (!matchingFile) {
    console.error(`FAIL MISSING: ${threshold.pattern} not found in coverage report`);
    exitCode = 1;
    continue;
  }

  const data = summary[matchingFile];
  const file = threshold.pattern;

  const checks = [
    { metric: 'lines', pct: data.lines.pct, required: threshold.lines },
    { metric: 'branches', pct: data.branches.pct, required: threshold.branches },
    { metric: 'functions', pct: data.functions.pct, required: threshold.functions },
    { metric: 'statements', pct: data.statements.pct, required: threshold.stmts },
  ];

  for (const check of checks) {
    if (check.pct < check.required) {
      console.error(
        `FAIL ${file} ${check.metric}: ${check.pct}% < ${check.required}% required`,
      );
      exitCode = 1;
    }
  }

  if (checks.every((c) => c.pct >= c.required)) {
    console.log(`PASS ${file}: lines=${data.lines.pct}% branches=${data.branches.pct}%`);
  }
}

if (exitCode === 0) {
  console.log('\n✓ All security coverage thresholds met.');
} else {
  console.error('\n✗ Security coverage gate FAILED.');
}

process.exit(exitCode);
