#!/bin/bash
set -e
cd /work/apps/platform-admin-console

echo "=== CONNECTIVITY ==="
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://host.docker.internal:4000/
curl -s -o /dev/null -w "Backend direct: %{http_code}\n" http://host.docker.internal:3001/health/ready
curl -s -o /dev/null -w "Frontend proxy: %{http_code}\n" http://host.docker.internal:4000/api/health/ready
echo ""

echo "=== RUN ONE PROVISIONING TEST ==="
pnpm exec playwright test --project=chromium \
  -g "should navigate to create tenant form" \
  --reporter=line \
  --timeout=20000 \
  --retries=0 2>&1

echo ""
echo "=== DONE ==="
