#!/bin/bash
# Diagnose one standard Playwright test failure
# Captures: URL, title, body text, console errors, network failures, screenshot

cd /work/apps/platform-admin-console

echo "=== CONNECTIVITY CHECK ==="
curl -s -o /dev/null -w "Frontend HTTP: %{http_code}\n" http://host.docker.internal:4000/
curl -s -o /dev/null -w "Backend HTTP: %{http_code}\n" http://host.docker.internal:3001/health/ready

echo ""
echo "=== FRONTEND HTML (first 1000 chars) ==="
curl -s http://host.docker.internal:4000/ | head -c 1000
echo ""

echo ""
echo "=== RUNNING DIAGNOSTIC TEST ==="
cat > /tmp/diagnostic.spec.ts << 'SPEC'
import { test, expect } from '@playwright/test';

test('diagnose application rendering', async ({ page }) => {
  const consoleMessages: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('requestfailed', req => {
    failedRequests.push(`FAILED: ${req.url()} - ${req.failure()?.errorText}`);
  });

  console.log('Navigating to /...');
  const response = await page.goto('/');
  console.log(`Response status: ${response?.status()}`);
  console.log(`Final URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);

  // Wait for any JS to execute
  await page.waitForTimeout(3000);

  const bodyText = await page.locator('body').innerText();
  console.log(`Body text (first 500): ${bodyText.slice(0, 500)}`);

  if (consoleMessages.length > 0) {
    console.log(`Console messages: ${consoleMessages.join(' | ')}`);
  }
  if (failedRequests.length > 0) {
    console.log(`Failed requests: ${failedRequests.join(' | ')}`);
  }

  // Check what's actually visible
  const headings = await page.locator('h1, h2, h3').allTextContents();
  console.log(`Headings: ${JSON.stringify(headings)}`);

  const buttons = await page.locator('button').allTextContents();
  console.log(`Buttons: ${JSON.stringify(buttons)}`);

  // Take screenshot
  await page.screenshot({ path: '/tmp/diagnostic.png', fullPage: true });
  console.log('Screenshot saved to /tmp/diagnostic.png');

  expect(response?.status()).toBeLessThan(400);
});
SPEC

pnpm exec playwright test /tmp/diagnostic.spec.ts \
  --config=playwright.config.js \
  --project=chromium \
  --workers=1 \
  --reporter=line \
  --timeout=30000 2>&1
