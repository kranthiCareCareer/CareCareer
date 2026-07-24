/**
 * Quick Playwright browser sanity check against Docker Compose demo.
 */
const { chromium } = require('C:/Users/Lenovo/Downloads/CareCareer/node_modules/.pnpm/playwright@1.52.0/node_modules/playwright');

async function main() {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to http://localhost:8080...');
  await page.goto('http://localhost:8080', { timeout: 15000 });

  const title = await page.title();
  console.log(`Page title: "${title}"`);

  const content = await page.content();
  const hasPersona = content.includes('Platform Administrator');
  console.log(`Persona selector visible: ${hasPersona}`);

  if (hasPersona) {
    // Try clicking admin persona
    await page.getByText('Platform Administrator').click();
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log(`After admin login URL: ${url}`);
    const bodyText = await page.textContent('body');
    console.log(`Dashboard visible: ${bodyText.includes('Dashboard') || bodyText.includes('dashboard')}`);
  }

  await browser.close();
  console.log(hasPersona ? '\n✅ BROWSER TEST PASS' : '\n❌ BROWSER TEST FAIL');
  process.exit(hasPersona ? 0 : 1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
