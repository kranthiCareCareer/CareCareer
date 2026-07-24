# CareCareer Local Demo Runbook

## Prerequisites

- Docker Desktop installed and running
- Git (for cloning)
- Make (or run commands manually)
- Node.js 20+ (for running acceptance tests on host)

No host-installed pnpm is required — services build inside Docker.

## Fresh-Clone Startup

```bash
git clone https://github.com/kranthiCareCareer/CareCareer.git
cd CareCareer
git checkout agent/gp07-credentials-clean

# Start all services (builds from source)
make demo-up

# Wait for all 7 containers to be healthy (1-2 minutes)
docker compose -f docker-compose.demo.yml ps

# Apply migrations and seed data
make demo-seed

# Run all tests
make demo-test
```

## Access Points

| Service      | URL                   | Purpose              |
| ------------ | --------------------- | -------------------- |
| Web UI       | http://localhost:8080 | Main application     |
| MailHog      | http://localhost:8025 | Email inbox viewer   |
| Identity API | http://localhost:3100 | Auth + sessions      |
| Platform API | http://localhost:3001 | Tenant management    |
| Staffing API | http://localhost:3200 | Workforce operations |
| PostgreSQL   | localhost:5432        | Database (direct)    |

## Demo Accounts

Select a persona from the login screen at http://localhost:8080:

| Persona                | Role           | What they can do                                  |
| ---------------------- | -------------- | ------------------------------------------------- |
| Platform Administrator | PLATFORM_ADMIN | Full access: facilities, workers, shifts, audit   |
| Worker — Sarah Johnson | WORKER         | Browse marketplace, request shifts, clock in/out  |
| Client — Mercy General | CLIENT         | Create shifts, confirm workers, approve timecards |

**Login process**: Click the persona button. No password needed (demo mode).

## Expected Health Status

After `make demo-up`, all 7 containers should show "healthy":

```
carecareer-demo-postgres   Up (healthy)
carecareer-demo-identity   Up (healthy)
carecareer-demo-platform   Up (healthy)
carecareer-demo-staffing   Up (healthy)
carecareer-demo-web        Up (healthy)
carecareer-demo-mailhog    Up (healthy)
carecareer-demo-proxy      Up (healthy)
```

## Complete Test Suite

```bash
make demo-test
```

This runs:

1. **Acceptance test** (20 steps) — full API workflow
2. **Notification proof** (8 steps) — delivery + deduplication
3. **Browser tests** (15 tests) — Playwright against live UI

## Reset Environment

```bash
make demo-reset   # Destroys volumes and rebuilds
make demo-seed    # Reapply migrations and seed data
make demo-test    # Verify everything works again
```

## Stop Environment

```bash
make demo-down    # Stop and remove all containers + volumes
```

## Executive Demo Script

See `docs/DEMO_SCRIPT.md` for the 10-minute presentation walkthrough.

## Common Recovery Steps

### Containers not starting

```bash
docker compose -f docker-compose.demo.yml logs
# Check for port conflicts
docker compose -f docker-compose.demo.yml down -v
docker compose -f docker-compose.demo.yml up -d --build
```

### Migrations failed

```bash
docker compose -f docker-compose.demo.yml exec -T staffing-service \
  sh -c "node services/staffing-service/scripts/demo-run-migrations.mjs"
```

### Tests failing after reset

```bash
# Ensure seed data is loaded
docker compose -f docker-compose.demo.yml exec -T staffing-service \
  sh -c "node services/staffing-service/scripts/demo-seed-data.mjs"
```

### Port 8080 already in use

```bash
# Find what's using the port
netstat -ano | findstr :8080
# Kill the process or change the nginx port in docker-compose.demo.yml
```

### Database access

```bash
docker compose -f docker-compose.demo.yml exec postgres \
  psql -U carecareer_admin -d carecareer_demo
```

## Cleanup

```bash
make demo-down
docker system prune -f   # Optional: remove dangling images
```
