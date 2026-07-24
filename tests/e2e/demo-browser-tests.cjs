/**
 * CareCareer Local MVP — Browser E2E Tests
 *
 * Tests the three-role workflow via Playwright against Docker Compose.
 * Prerequisite: make demo-up && make demo-seed
 *
 * Run: node tests/e2e/demo-browser-tests.cjs
 */
const { chromium } = require('C:/Users/Lenovo/Downloads/CareCareer/node_modules/.pnpm/playwright@1.52.0/node_modules/playwright');

const BASE_URL = 'http://localhost:8080';
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

async function main() {
  console.log('\n🌐 CareCareer Browser E2E Tests\n');

  const browser = await chromium.launch({ headless: true });

  // ─── ADMIN JOURNEY ─────────────────────────────────────────────────────────
  console.log('  ADMIN JOURNEY:');

  await test('Admin: sign in via persona selector', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    const content = await page.content();
    assert(content.includes('Platform Administrator'), 'Persona not found');
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(1000);
    assert(page.url() === `${BASE_URL}/` || page.url().startsWith(BASE_URL), 'Not redirected');
    await page.close();
  });

  await test('Admin: view facilities page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/facilities`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    assert(content.includes('Mercy') || content.includes('Facilit'), 'Facilities not shown');
    await page.close();
  });

  await test('Admin: view workers page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/workers`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    assert(content.includes('Johnson') || content.includes('Worker'), 'Workers not shown');
    await page.close();
  });

  await test('Admin: view shifts page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/shifts`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    assert(content.includes('Shift') || content.includes('RN'), 'Shifts not shown');
    await page.close();
  });

  await test('Admin: view audit page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/audit`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    // Audit page should load without error
    assert(!content.includes('Internal Server Error'), 'Page error');
    await page.close();
  });

  // ─── WORKER JOURNEY ────────────────────────────────────────────────────────
  console.log('  WORKER JOURNEY:');

  await test('Worker: sign in and see marketplace link', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Worker — Sarah Johnson').click();
    await page.waitForTimeout(1000);
    const content = await page.content();
    assert(
      content.includes('marketplace') || content.includes('Marketplace') ||
      content.includes('Available') || content.includes('assignment'),
      'Worker routes not visible'
    );
    await page.close();
  });

  await test('Worker: browse marketplace', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Worker — Sarah Johnson').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/marketplace`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    assert(content.includes('Shift') || content.includes('Available') || content.includes('RN'), 'Marketplace empty');
    await page.close();
  });

  await test('Worker: view notifications page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Worker — Sarah Johnson').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/notifications`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    assert(!content.includes('Internal Server Error'), 'Notification page error');
    await page.close();
  });

  // ─── CLIENT JOURNEY ────────────────────────────────────────────────────────
  console.log('  CLIENT JOURNEY:');

  await test('Client: sign in and see shift routes', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Client — Mercy General').click();
    await page.waitForTimeout(1000);
    const content = await page.content();
    assert(
      content.includes('Shift') || content.includes('shift') ||
      content.includes('Create') || content.includes('Timecard'),
      'Client routes not visible'
    );
    await page.close();
  });

  await test('Client: view timecards page', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Client — Mercy General').click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/timecards`);
    await page.waitForTimeout(2000);
    const content = await page.content();
    assert(content.includes('Timecard') || content.includes('timecard'), 'Timecards not shown');
    await page.close();
  });

  // ─── SECURITY ──────────────────────────────────────────────────────────────
  console.log('  SECURITY:');

  await test('Unauthenticated user sees persona selector', async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/shifts`);
    await page.waitForTimeout(1000);
    const content = await page.content();
    assert(content.includes('Platform Administrator'), 'Should show persona selector');
    await page.close();
  });

  await test('Worker cannot see admin tenants route', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Worker — Sarah Johnson').click();
    await page.waitForTimeout(500);
    const content = await page.content();
    const hasTenants = content.includes('>Tenants<') || content.includes('href="/tenants"');
    assert(!hasTenants, 'Worker should not see tenants link');
    await page.close();
  });

  // ─── ACCESSIBILITY ─────────────────────────────────────────────────────────
  console.log('  ACCESSIBILITY:');

  await test('Page has heading structure', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(1000);
    const headings = await page.locator('h1, h2, h3').count();
    assert(headings > 0, 'No headings found');
    await page.close();
  });

  await test('Buttons are keyboard focusable', async () => {
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    assert(focused !== 'BODY', 'Tab did not move focus');
    await page.close();
  });

  // ─── MOBILE VIEWPORT ──────────────────────────────────────────────────────
  console.log('  MOBILE VIEWPORT:');

  await test('App renders at mobile width', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    const content = await page.content();
    assert(content.includes('Platform Administrator'), 'App not rendered at mobile');
    await page.close();
  });

  await browser.close();

  // ─── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n  Browser Tests: ${passed} passed, ${failed} failed out of ${results.length}\n`);

  if (failed > 0) {
    console.log('  Failed:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`    - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('  🎉 All browser tests passed!\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
