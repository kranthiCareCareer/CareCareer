/**
 * Quick Playwright sanity check — no config needed.
 */
import { chromium } from '../../apps/platform-admin-console/node_modules/playwright/index.mjs';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to http://localhost:8080...');
  await page.goto('http://localhost:8080', { timeout: 15000 });
  const title = await page.title();
  console.log(`Page title: ${title}`);
  const content = await page.content();
  const hasPersona = content.includes('Platform Administrator');
  console.log(`Persona selector visible: ${hasPersona}`);
  await browser.close();
  console.log(hasPersona ? 'PASS' : 'FAIL');
  process.exit(hasPersona ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
