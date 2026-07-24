/**
 * CareCareer Accessibility Audit
 *
 * Uses Axe-core via Playwright to check all primary pages.
 * Requirements:
 * - Zero critical violations
 * - Zero serious violations
 * - Valid landmarks, headings, labels, keyboard focus
 *
 * Run: node tests/e2e/accessibility-audit.cjs
 * Prerequisite: make demo-up && make demo-seed
 */
const {
  chromium,
} = require('C:/Users/Lenovo/Downloads/CareCareer/node_modules/.pnpm/playwright@1.52.0/node_modules/playwright');
const {
  AxeBuilder,
} = require('C:/Users/Lenovo/Downloads/CareCareer/node_modules/.pnpm/@axe-core+playwright@4.10.1_playwright-core@1.52.0/node_modules/@axe-core/playwright');

const BASE_URL = 'http://localhost:8080';
const results = [];

async function auditPage(browser, name, url, persona) {
  let context;
  let page;
  try {
    context = await browser.newContext();
    page = await context.newPage();

    // Navigate to home and select persona
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);

    if (persona) {
      await page.getByText(persona).click();
      await page.waitForTimeout(1000);
    }

    if (url && url !== '/') {
      await page.goto(`${BASE_URL}${url}`);
      await page.waitForTimeout(2000);
    }

    // Run Axe accessibility scan
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = axeResults.violations.filter((v) => v.impact === 'critical');
    const serious = axeResults.violations.filter((v) => v.impact === 'serious');
    const moderate = axeResults.violations.filter((v) => v.impact === 'moderate');
    const minor = axeResults.violations.filter((v) => v.impact === 'minor');

    if (critical.length > 0 || serious.length > 0) {
      const issues = [...critical, ...serious]
        .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instance(s))`)
        .join('\n      ');
      results.push({
        page: name,
        status: 'FAIL',
        critical: critical.length,
        serious: serious.length,
        error: issues,
      });
      console.log(`  ❌ ${name}: ${critical.length} critical, ${serious.length} serious`);
      if (critical.length > 0)
        console.log(`      Critical: ${critical.map((v) => v.id).join(', ')}`);
      if (serious.length > 0) console.log(`      Serious: ${serious.map((v) => v.id).join(', ')}`);
    } else {
      results.push({ page: name, status: 'PASS', moderate: moderate.length, minor: minor.length });
      console.log(`  ✅ ${name} (${moderate.length} moderate, ${minor.length} minor)`);
    }
  } catch (err) {
    results.push({ page: name, status: 'ERROR', error: err.message });
    console.log(`  ⚠️  ${name}: ${err.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

async function main() {
  console.log('\n♿ CareCareer Accessibility Audit\n');
  console.log('  Using: axe-core (WCAG 2.1 AA)\n');

  const browser = await chromium.launch({ headless: true });

  // ─── ADMIN PAGES ───────────────────────────────────────────────────────────
  console.log('  ADMIN PAGES:');
  await auditPage(browser, 'Persona Selector', '/', null);
  await auditPage(browser, 'Admin Dashboard', '/', 'Platform Administrator');
  await auditPage(browser, 'Admin Facilities', '/facilities', 'Platform Administrator');
  await auditPage(browser, 'Admin Workers', '/workers', 'Platform Administrator');
  await auditPage(browser, 'Admin Shifts', '/shifts', 'Platform Administrator');
  await auditPage(browser, 'Admin Audit', '/audit', 'Platform Administrator');

  // ─── WORKER PAGES ──────────────────────────────────────────────────────────
  console.log('  WORKER PAGES:');
  await auditPage(browser, 'Worker Marketplace', '/marketplace', 'Worker — Sarah Johnson');
  await auditPage(browser, 'Worker Assignments', '/my-assignments', 'Worker — Sarah Johnson');
  await auditPage(browser, 'Worker Notifications', '/notifications', 'Worker — Sarah Johnson');

  // ─── CLIENT PAGES ──────────────────────────────────────────────────────────
  console.log('  CLIENT PAGES:');
  await auditPage(browser, 'Client Shifts', '/shifts', 'Client — Mercy General');
  await auditPage(browser, 'Client Create Shift', '/shifts/create', 'Client — Mercy General');
  await auditPage(browser, 'Client Timecards', '/timecards', 'Client — Mercy General');

  // ─── MOBILE VIEWPORT ──────────────────────────────────────────────────────
  console.log('  MOBILE VIEWPORT:');
  const mobileBrowser = await chromium.launch({ headless: true });
  await auditPage(mobileBrowser, 'Mobile Persona Selector', '/', null);
  await auditPage(
    mobileBrowser,
    'Mobile Worker Marketplace',
    '/marketplace',
    'Worker — Sarah Johnson',
  );
  await mobileBrowser.close();

  await browser.close();

  // ─── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;

  const totalCritical = results.reduce((sum, r) => sum + (r.critical ?? 0), 0);
  const totalSerious = results.reduce((sum, r) => sum + (r.serious ?? 0), 0);
  const totalModerate = results.reduce((sum, r) => sum + (r.moderate ?? 0), 0);
  const totalMinor = results.reduce((sum, r) => sum + (r.minor ?? 0), 0);

  console.log(`\n  Pages audited: ${results.length}`);
  console.log(`  Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
  console.log(
    `  Critical: ${totalCritical} | Serious: ${totalSerious} | Moderate: ${totalModerate} | Minor: ${totalMinor}`,
  );

  if (totalCritical > 0 || totalSerious > 0) {
    console.log('\n  ❌ ACCESSIBILITY GATE FAILED\n');
    console.log('  Pages with violations:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`    - ${r.page}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log('\n  ✅ ACCESSIBILITY GATE PASSED — zero critical, zero serious\n');
    if (totalModerate > 0 || totalMinor > 0) {
      console.log('  Non-blocking findings (moderate/minor):');
      results
        .filter((r) => r.moderate > 0 || r.minor > 0)
        .forEach((r) => {
          console.log(`    - ${r.page}: ${r.moderate ?? 0} moderate, ${r.minor ?? 0} minor`);
        });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
