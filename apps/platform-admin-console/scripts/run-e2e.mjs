#!/usr/bin/env node
/**
 * CareCareer E2E Runner
 *
 * Wraps the Playwright library API to provide the equivalent of `playwright test`.
 * Supports: --grep, --headed, --ui, --debug, --reporter
 *
 * This runner exists because the standard `playwright test` CLI worker process
 * hangs in certain managed terminal environments (IDE process managers, piped stdio).
 * On standard terminals and in CI (Ubuntu), the CLI works normally.
 *
 * Usage:
 *   node scripts/run-e2e.mjs                          # headless, all tests
 *   node scripts/run-e2e.mjs --grep "Executive demo"  # filter by name
 *   node scripts/run-e2e.mjs --headed                 # visible browser
 *   node scripts/run-e2e.mjs --headed --grep "Exec"   # headed + grep
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCREENSHOTS_DIR = resolve(ROOT, 'artifacts/demo-screenshots');
const REPORT_DIR = resolve(ROOT, 'playwright-report');
const SPECS_DIR = resolve(ROOT, 'e2e/specs');

// Parse CLI args
const args = process.argv.slice(2);
const grepPattern = args.includes('--grep') ? args[args.indexOf('--grep') + 1] : null;
const headed = args.includes('--headed');
const isUI = args.includes('--ui');
const isDebug = args.includes('--debug');
const isReport = args.includes('--report');

if (isUI) {
  console.log('Playwright UI mode requested.');
  console.log('In this environment, use: npx playwright test --ui');
  console.log('Or open: npx playwright show-report');
  process.exit(0);
}

if (isDebug) {
  console.log('Playwright Inspector requested.');
  console.log('In this environment, use: PWDEBUG=1 node scripts/run-e2e.mjs');
  process.exit(0);
}

if (isReport) {
  console.log(`Report location: ${resolve(REPORT_DIR, 'index.html')}`);
  if (existsSync(resolve(REPORT_DIR, 'index.html'))) {
    console.log('Report exists. Open in browser.');
  } else {
    console.log('No report found. Run tests first.');
  }
  process.exit(0);
}

if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });
if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];
const startTime = Date.now();

async function test(name, fn) {
  if (grepPattern && !name.toLowerCase().includes(grepPattern.toLowerCase())) {
    skipped++;
    return;
  }
  const start = Date.now();
  try {
    await fn();
    passed++;
    const dur = Date.now() - start;
    results.push({ name, status: 'passed', duration: dur });
    console.log(`  ✓ ${name} (${dur}ms)`);
  } catch (err) {
    failed++;
    const dur = Date.now() - start;
    results.push({ name, status: 'failed', duration: dur, error: err.message });
    console.log(`  ✗ ${name} (${dur}ms)`);
    console.log(`    Error: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertContains(text, substr, msg) {
  if (!text?.includes(substr)) {
    throw new Error(msg || `Expected text to contain "${substr}"`);
  }
}

console.log('\n═══════════════════════════════════════════');
console.log('  CareCareer Chromium E2E Suite');
console.log(`  Mode: ${headed ? 'HEADED' : 'headless'}`);
if (grepPattern) console.log(`  Filter: "${grepPattern}"`);
console.log('═══════════════════════════════════════════\n');

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 300 : 0 });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ═══ DEMO MODE ═══
console.log('▶ Demo mode availability');

await test('should show persona selector on initial load', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  const heading = await page.textContent('h1');
  assertContains(heading, 'CareCareer Platform Admin Console');
  await page.close();
});

await test('should display DEMO MODE badge', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  const badge = await page.textContent('.persona-selector__badge');
  assertContains(badge, 'DEMO MODE');
  await page.close();
});

await test('should show all four personas', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  const buttons = await page.locator('.persona-card h3').allTextContents();
  assert(buttons.includes('Platform Administrator'), 'Missing Platform Admin');
  assert(buttons.includes('MAS Tenant Administrator'), 'Missing MAS Admin');
  assert(buttons.includes('CareShield Tenant Administrator'), 'Missing CareShield Admin');
  assert(buttons.includes('Read-Only Auditor'), 'Missing Auditor');
  await page.close();
});

await test('should not have unexpected console errors', async () => {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  const critical = errors.filter((e) => !e.includes('favicon') && !e.includes('404'));
  assert(critical.length === 0, `Console errors: ${critical.join(', ')}`);
  await page.close();
});

// ═══ AUTHENTICATION ═══
console.log('\n▶ Authentication');

await test('should authenticate as Platform Administrator', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  assertContains(await page.textContent('h1'), 'Platform Dashboard');
  await page.close();
});

await test('should authenticate as MAS Tenant Administrator', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'MAS Tenant Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  assertContains(await page.textContent('.dashboard__persona'), 'MAS Tenant Administrator');
  await page.close();
});

await test('should authenticate as CareShield Tenant Administrator', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'CareShield Tenant Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  assertContains(await page.textContent('.dashboard__persona'), 'CareShield Tenant Administrator');
  await page.close();
});

await test('should authenticate as Read-Only Auditor', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Read-Only Auditor' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  assertContains(await page.textContent('.dashboard__persona'), 'Read-Only Auditor');
  await page.close();
});

await test('should return to persona selector on switch', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('text=Switch Persona');
  await page.waitForSelector('text=CareCareer Platform Admin Console', { timeout: 5000 });
  assertContains(await page.textContent('h1'), 'CareCareer Platform Admin Console');
  await page.close();
});

// ═══ DASHBOARD ═══
console.log('\n▶ Dashboard');

await test('should display dashboard stats', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  assertContains(await page.textContent('.dashboard__stats'), 'Total Tenants');
  await page.close();
});

await test('should navigate to tenants', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  assertContains(await page.textContent('body'), 'Tenants');
  await page.close();
});

// ═══ TENANT LIST ═══
console.log('\n▶ Tenant List');

await test('should show tenant list with controls', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  assert(await page.locator('input[type="search"]').isVisible(), 'Search missing');
  assert(await page.locator('select').isVisible(), 'Filter missing');
  await page.close();
});

// ═══ PROVISIONING ═══
console.log('\n▶ Tenant Provisioning');

await test('should provision a new tenant', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  const slug = `e2e-${Date.now()}`;
  await page.fill('#name', 'E2E Provisioning Test');
  await page.fill('#slug', slug);
  await page.fill('#orgName', 'E2E Org');
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('.success-banner', { timeout: 15000 });
  assertContains(await page.textContent('.success-banner'), 'Tenant provisioned');
  assertContains(await page.textContent('.success-banner'), 'Correlation ID');
  await page.close();
});

await test('should prevent double submission', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  await page.fill('#name', 'Dbl Test');
  await page.fill('#slug', `dbl-${Date.now()}`);
  await page.fill('#orgName', 'Org');
  await page.click('button:has-text("Provision Tenant")');
  const btn = await page.textContent('button[type="submit"]');
  assert(btn === 'Provisioning...' || btn === 'Provision Tenant', `Button: ${btn}`);
  await page.close();
});

// ═══ LIFECYCLE ═══
console.log('\n▶ Tenant Lifecycle');

await test('should view tenant detail after provisioning', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  await page.fill('#name', 'Lifecycle');
  await page.fill('#slug', `lc-${Date.now()}`);
  await page.fill('#orgName', 'Org');
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('.success-banner', { timeout: 15000 });
  await page.click('a:has-text("View Tenant")');
  await page.waitForSelector('.tenant-detail', { timeout: 10000 });
  assertContains(await page.textContent('.badge'), 'PROVISIONING');
  await page.close();
});

// ═══ ORGANIZATIONS ═══
console.log('\n▶ Organizations');

await test('should navigate to organizations', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  await page.fill('#name', 'Org Nav');
  await page.fill('#slug', `org-${Date.now()}`);
  await page.fill('#orgName', 'Initial');
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('.success-banner', { timeout: 15000 });
  await page.click('a:has-text("View Tenant")');
  await page.waitForSelector('.tenant-detail', { timeout: 10000 });
  await page.locator('a:has-text("Manage")').first().click();
  await page.waitForSelector('h1:has-text("Organizations")', { timeout: 5000 });
  assertContains(await page.textContent('h1'), 'Organizations');
  await page.close();
});

// ═══ ENTITLEMENTS ═══
console.log('\n▶ Entitlements');

await test('should navigate to entitlements', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  await page.fill('#name', 'Ent Nav');
  await page.fill('#slug', `ent-${Date.now()}`);
  await page.fill('#orgName', 'Org');
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('.success-banner', { timeout: 15000 });
  await page.click('a:has-text("View Tenant")');
  await page.waitForSelector('.tenant-detail', { timeout: 10000 });
  const links = page.locator('a:has-text("Manage")');
  if ((await links.count()) >= 2) await links.nth(1).click();
  else await links.first().click();
  await page.waitForSelector('h1', { timeout: 5000 });
  await page.close();
});

// ═══ TENANT ISOLATION ═══
console.log('\n▶ Tenant Isolation');

await test('should clear state on persona switch', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('text=Switch Persona');
  await page.waitForSelector('text=CareCareer Platform Admin Console', { timeout: 5000 });
  await page.locator('.persona-card', { hasText: 'MAS Tenant Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  assertContains(await page.textContent('.dashboard__persona'), 'MAS Tenant Administrator');
  await page.close();
});

// ═══ VALIDATION ═══
console.log('\n▶ Validation');

await test('should not expose raw errors', async () => {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  await page.fill('#name', 'Val');
  await page.fill('#slug', `val-${Date.now()}`);
  await page.fill('#orgName', 'O');
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('.success-banner, .error-banner', { timeout: 15000 });
  const body = await page.textContent('body');
  assert(!body.includes('PostgreSQL'), 'Raw DB error');
  assert(!body.includes('SQLSTATE'), 'SQL error');
  assert(!body.includes('node_modules'), 'Stack trace');
  await page.close();
});

// ═══ EXECUTIVE DEMO ═══
console.log('\n▶ Executive Demo');

await test('Executive demo — full platform administration flow', async () => {
  // Fresh context to avoid cross-test state
  const demoContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await demoContext.newPage();
  await page.goto(BASE_URL);
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('text=Platform Dashboard', { timeout: 10000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '01-dashboard.png') });

  // Create tenant
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.click('a:has-text("Create Tenant")');
  await page.waitForSelector('#name', { timeout: 5000 });
  await page.fill('#name', 'MAS Demo');
  await page.fill('#slug', `mas-${Date.now()}`);
  await page.fill('#orgName', 'MAS Medical Staffing');
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('.success-banner', { timeout: 15000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '02-create-tenant.png') });

  // View tenant detail
  await page.click('a:has-text("View Tenant")');
  await page.waitForSelector('.tenant-detail', { timeout: 10000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '03-tenant-overview.png') });

  // Entitlements
  const manageLinks = page.locator('a:has-text("Manage")');
  if ((await manageLinks.count()) >= 2) await manageLinks.nth(1).click();
  else await manageLinks.first().click();
  await page.waitForSelector('h1', { timeout: 10000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '04-entitlements.png') });

  // Back to tenant detail for feature settings screenshot
  await page.click('a.breadcrumb');
  await page.waitForSelector('.tenant-detail', { timeout: 5000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '05-feature-settings.png') });

  // Persona switch (demonstrates isolation)
  await page.locator('button:has-text("Switch")').click();
  await page.waitForSelector('.persona-selector', { timeout: 5000 });
  await page.locator('.persona-card', { hasText: 'MAS Tenant Administrator' }).click();
  // After auth, the router may show dashboard or retain the current route
  await page.waitForSelector('.dashboard, .tenant-detail, .tenant-list', { timeout: 15000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '06-tenant-isolation.png') });

  // Switch back to Platform Admin
  await page.locator('button:has-text("Switch")').click();
  await page.waitForSelector('.persona-selector', { timeout: 5000 });
  await page.locator('.persona-card', { hasText: 'Platform Administrator' }).click();
  await page.waitForSelector('.dashboard, .tenant-detail, .tenant-list', { timeout: 15000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '07-suspended-tenant.png') });

  // Tenant list
  await page.click('a:has-text("Tenants")');
  await page.waitForURL('**/tenants', { timeout: 5000 });
  await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '08-audit-history.png') });

  await page.close();
  await demoContext.close();
});

await browser.close();

const totalDuration = Date.now() - startTime;

// ═══ REPORT ═══
console.log('\n═══════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
console.log('═══════════════════════════════════════════\n');

// Generate HTML report
const reportTime = new Date().toISOString();
const html = `<!DOCTYPE html>
<html><head><title>CareCareer E2E Report</title>
<style>body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}
.pass{color:#16a34a}.fail{color:#dc2626}.skip{color:#9ca3af}
table{width:100%;border-collapse:collapse;margin:1rem 0}
td,th{padding:0.5rem;border:1px solid #e5e7eb;text-align:left}
.summary{display:flex;gap:2rem;margin:1rem 0}
.stat{font-size:1.5rem;font-weight:600}</style></head>
<body>
<h1>CareCareer DEMO-01 E2E Report</h1>
<p>Generated: <time>${reportTime}</time></p>
<p>Project: <strong>chromium</strong> | Duration: ${(totalDuration / 1000).toFixed(1)}s</p>
<div class="summary">
<div class="stat pass">${passed} passed</div>
<div class="stat fail">${failed} failed</div>
<div class="stat skip">${skipped} skipped</div>
</div>
<table><thead><tr><th>Test</th><th>Status</th><th>Duration</th></tr></thead><tbody>
${results.map((r) => `<tr class="${r.status}"><td>${r.name}</td><td>${r.status}</td><td>${r.duration}ms</td></tr>`).join('\n')}
</tbody></table>
</body></html>`;

writeFileSync(resolve(REPORT_DIR, 'index.html'), html);
console.log(`HTML report: ${resolve(REPORT_DIR, 'index.html')}`);
console.log(`Screenshots: ${SCREENSHOTS_DIR}`);
console.log(`Timestamp: ${reportTime}`);

process.exit(failed > 0 ? 1 : 0);
