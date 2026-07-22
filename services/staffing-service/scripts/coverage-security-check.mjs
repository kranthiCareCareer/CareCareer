#!/usr/bin/env node
/**
 * GP-05/GP-06 Security Coverage Gate
 * Reads coverage-summary.json and enforces per-file thresholds
 * for security-critical modules in the staffing service.
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
 * Security-critical files and their required thresholds.
 * GP-05: Facility/department/credential management
 * GP-06: Worker lifecycle and privacy
 */
const SECURITY_THRESHOLDS = [
  // Authentication/Authorization
  { pattern: 'staffing-auth.guard.ts', lines: 85, branches: 70, functions: 95, stmts: 85 },
  { pattern: 'staffing-permission.guard.ts', lines: 85, branches: 65, functions: 95, stmts: 85 },
  { pattern: 'local-jwks-token-validator.ts', lines: 85, branches: 65, functions: 95, stmts: 85 },
  { pattern: 'pii-redaction.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  // Domain
  { pattern: 'domain/facility.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'domain/department.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'domain/worker.ts', lines: 95, branches: 80, functions: 95, stmts: 95 },
  { pattern: 'domain/credential-requirement.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  // Application Commands
  { pattern: 'create-facility.command.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'create-department.command.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'create-worker.command.ts', lines: 95, branches: 90, functions: 95, stmts: 95 },
  { pattern: 'change-worker-status.command.ts', lines: 95, branches: 75, functions: 95, stmts: 95 },
  // Repository
  { pattern: 'postgres-staffing-repository.ts', lines: 85, branches: 85, functions: 85, stmts: 85 },
  // Controllers
  { pattern: 'facility.controller.ts', lines: 85, branches: 55, functions: 95, stmts: 85 },
  { pattern: 'worker.controller.ts', lines: 85, branches: 55, functions: 95, stmts: 85 },
];

const GLOBAL_THRESHOLDS = { lines: 85, branches: 75, functions: 85, stmts: 85 };

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
  const normalizedPattern = threshold.pattern.replace(/\//g, '\\');
  const matchingFile = files.find((f) => f.includes(threshold.pattern) || f.includes(normalizedPattern));
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
      console.error(`FAIL ${file} ${check.metric}: ${check.pct}% < ${check.required}% required`);
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
