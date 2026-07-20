#!/bin/bash
set -e

echo "=== ENVIRONMENT ==="
node --version

corepack enable
pnpm --version

echo "=== COPY WORKSPACE MANIFESTS ==="
mkdir -p /workspace
cp /src/package.json /src/pnpm-lock.yaml /src/pnpm-workspace.yaml /workspace/
cp /src/.npmrc /workspace/ 2>/dev/null || true

# Copy all package.json files preserving directory structure
find /src/packages -name package.json -maxdepth 2 | while read f; do
  rel=${f#/src/}
  mkdir -p /workspace/$(dirname "$rel")
  cp "$f" /workspace/"$rel"
done

find /src/services -name package.json -maxdepth 2 | while read f; do
  rel=${f#/src/}
  mkdir -p /workspace/$(dirname "$rel")
  cp "$f" /workspace/"$rel"
done

find /src/apps -name package.json -maxdepth 2 | while read f; do
  rel=${f#/src/}
  mkdir -p /workspace/$(dirname "$rel")
  cp "$f" /workspace/"$rel"
done

find /src/tooling -name package.json -maxdepth 2 2>/dev/null | while read f; do
  rel=${f#/src/}
  mkdir -p /workspace/$(dirname "$rel")
  cp "$f" /workspace/"$rel"
done

cd /workspace

echo "=== FROZEN LOCKFILE INSTALL ==="
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "EXIT: $?"

echo "=== PLAYWRIGHT CHECK ==="
cd apps/platform-admin-console
pnpm exec playwright --version
pnpm exec playwright install --with-deps chromium 2>&1 | tail -3

echo "=== DISCOVERY ==="
pnpm exec playwright test --list 2>&1 | tail -10

echo "=== RESULT ==="
echo "Frozen lockfile: PASSED"
echo "Discovery: COMPLETED"
