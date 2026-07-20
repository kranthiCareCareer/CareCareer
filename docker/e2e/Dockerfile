# Playwright E2E runner for CareCareer
# Prebakes workspace dependencies and browser binaries for fast test execution.
# Node 22 baseline matching the repository's approved runtime.

FROM node:22-bookworm

# Enable corepack for deterministic pnpm
RUN corepack enable

WORKDIR /work

# Copy workspace manifests for dependency install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/request-context/package.json packages/request-context/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/events/package.json packages/events/
COPY packages/idempotency/package.json packages/idempotency/
COPY packages/observability/package.json packages/observability/
COPY packages/service-core/package.json packages/service-core/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/testing/package.json packages/testing/
COPY packages/engineering-smoke-test/package.json packages/engineering-smoke-test/
COPY services/platform-service/package.json services/platform-service/
COPY services/identity-service/package.json services/identity-service/
COPY services/service-template/package.json services/service-template/
COPY apps/platform-admin-console/package.json apps/platform-admin-console/
COPY tooling/generators/service/package.json tooling/generators/service/

# Install workspace dependencies (frozen lockfile for determinism)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Install Playwright browsers with system dependencies
RUN pnpm --filter @carecareer/platform-admin-console exec playwright install --with-deps chromium firefox webkit

# Copy full source (tests, configs, fixtures)
COPY . .

# Set working directory to the app with Playwright config
WORKDIR /work/apps/platform-admin-console

# Default: list tests for verification
CMD ["pnpm", "exec", "playwright", "test", "--list"]
