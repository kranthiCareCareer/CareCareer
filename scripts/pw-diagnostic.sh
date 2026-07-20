#!/bin/bash
set -e

echo "=== ENVIRONMENT ==="
node --version
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"

mkdir -p /tmp/pw-diagnostic
cd /tmp/pw-diagnostic

npm init -y > /dev/null 2>&1
npm install --save-dev @playwright/test@1.52.0 > /dev/null 2>&1
npx playwright install --with-deps chromium > /dev/null 2>&1

cat > minimal.spec.js << 'SPEC'
const { test, expect } = require("@playwright/test");

test("minimal runner works", async ({ page }) => {
  await page.setContent("<main><h1>Playwright works</h1></main>");
  await expect(page.getByRole("heading")).toHaveText("Playwright works");
});

test("browser launches correctly", async ({ page }) => {
  await page.setContent("<button>Click</button>");
  await expect(page.getByRole("button", { name: "Click" })).toBeVisible();
});
SPEC

echo "=== PLAYWRIGHT VERSION ==="
npx playwright --version

echo "=== TEST DISCOVERY ==="
npx playwright test --list

echo "=== TEST EXECUTION ==="
npx playwright test minimal.spec.js --workers=1 --reporter=line

echo "=== RESULT: SUCCESS ==="
