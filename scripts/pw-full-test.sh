#!/bin/bash
set -e

echo "=== ENVIRONMENT ==="
node --version
corepack enable
pnpm --version

echo "=== INSTALL ==="
cd /work
pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -3

echo "=== PLAYWRIGHT INSTALL ==="
cd apps/platform-admin-console
pnpm exec playwright install --with-deps chromium 2>&1 | tail -3

echo "=== TEST DISCOVERY ==="
pnpm exec playwright test --list 2>&1

echo "=== CHROMIUM SMOKE ==="
pnpm exec playwright test --project=chromium --grep="@smoke" --reporter=line 2>&1 || true

echo "=== CHROMIUM NAVIGATION SMOKE ==="
pnpm exec playwright test e2e/specs/navigation-smoke.spec.ts --project=chromium --reporter=line --workers=1 2>&1 || true

echo "=== DONE ==="
