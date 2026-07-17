# DEMO-01 Troubleshooting

## Docker Issues

### PostgreSQL container won't start

```bash
# Check if port 5432 is in use
netstat -an | findstr 5432   # Windows
lsof -i :5432               # macOS/Linux

# Stop conflicting postgres
docker compose -f docker-compose.demo.yml down -v
docker ps | grep postgres    # Check for other containers

# Restart clean
pnpm demo:down
pnpm demo:up
```

### "port is already allocated"

Another container or local PostgreSQL is using port 5432. Stop it first:

```bash
# Stop local PostgreSQL service (Windows)
net stop postgresql-x64-16

# Stop all Docker containers
docker stop $(docker ps -q)
```

### Volume permissions

```bash
# Reset volumes
docker compose -f docker-compose.demo.yml down -v
pnpm demo:up
```

## Port Conflicts

| Service    | Port | Solution if occupied                        |
| ---------- | ---- | ------------------------------------------- |
| PostgreSQL | 5432 | Stop local pg or change docker-compose port |
| Backend    | 3001 | Kill process on port: `npx kill-port 3001`  |
| Frontend   | 4000 | Kill process on port: `npx kill-port 4000`  |

## Migration Issues

### "relation already exists"

Migrations were already applied. This is safe to ignore on `demo:up`.

### "role already exists"

Roles persist across restarts (unless volumes are removed). Safe to ignore.

### Migration fails with syntax error

Check that the SQL file exists and is valid:

```bash
cat services/platform-service/prisma/migrations/001_initial_schema.sql
```

## Chromium Issues

### "Executable doesn't exist"

Playwright browsers not installed:

```bash
npx playwright install chromium
```

### "Browser closed unexpectedly"

Usually a resource issue. Try:

```bash
# Increase timeout
npx playwright test --timeout 60000

# Run with debug logging
DEBUG=pw:browser npx playwright test
```

### Tests fail with "page.goto: net::ERR_CONNECTION_REFUSED"

Frontend or backend is not running:

```bash
# Check services
curl http://localhost:3001/health
curl http://localhost:4000

# Start them
pnpm --filter @carecareer/platform-service dev &
pnpm --filter @carecareer/platform-admin-console dev &
```

### Headed mode won't open on WSL/remote

Playwright needs a display server. On WSL:

```bash
export DISPLAY=:0
# Or use WSLg (Windows 11)
```

On headless Linux CI, use the default headless mode.

## Readiness Issues

### Backend won't start

Check `.env` in `services/platform-service/`:

```
DATABASE_URL=postgresql://carecareer_admin:demo_password_not_for_production@localhost:5432/carecareer_demo
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
DEMO_MODE=true
DEMO_AUTH_SECRET=carecareer-demo-secret-for-testing-only-do-not-use-in-production
```

### "Configuration validation failed"

Missing required environment variables. Run `pnpm demo:up` which auto-generates `.env`.

### Demo token endpoint returns 404

DEMO_MODE is not enabled. Verify:

- `.env` has `DEMO_MODE=true`
- `NODE_ENV` is not `production`
- `DEMO_AUTH_SECRET` is at least 32 characters

### Frontend shows "Connect to the platform-service"

Backend is not running or proxy is misconfigured. The Vite dev server proxies `/api` to `http://localhost:3001`.

## Test Failures

### Flaky E2E tests

```bash
# Run with trace for debugging
npx playwright test --trace on

# Run single test with debug
npx playwright test --debug -g "test name"
```

### "act(...) not configured"

This is a React 19 warning in vitest with jsdom. It doesn't affect test results.

### Integration tests need Docker

Integration tests use Testcontainers which requires Docker:

```bash
docker info  # Verify Docker is running
pnpm --filter @carecareer/platform-service test:integration
```

## Useful Commands

```bash
# Full clean restart
pnpm demo:down
docker compose -f docker-compose.demo.yml down -v
pnpm demo:up

# Watch mode for frontend tests
pnpm --filter @carecareer/platform-admin-console test:watch

# Playwright UI mode (interactive)
pnpm demo:e2e:ui

# Generate test code
pnpm demo:e2e:record

# View latest report
pnpm demo:e2e:report
```
