# CareCareer Local Demo Runbook

## Prerequisites

- Docker and Docker Compose installed
- Git (for cloning)
- Make (optional, can use docker compose directly)

No host-installed Node.js is required — everything runs in containers.

## Quick Start

```bash
# Clone and start
git clone https://github.com/kranthiCareCareer/CareCareer.git
cd CareCareer
make demo-up

# Wait for health checks (1-2 minutes)
make demo-status

# Seed demo data
make demo-seed
```

## Access Points

| Service       | URL                         | Purpose              |
| ------------- | --------------------------- | -------------------- |
| Web UI        | http://localhost:8080        | Main application     |
| MailHog       | http://localhost:8025        | Email inbox viewer   |
| Identity API  | http://localhost:3100        | Auth endpoints       |
| Platform API  | http://localhost:3001        | Tenant management    |
| Staffing API  | http://localhost:3200        | Workforce operations |
| PostgreSQL    | localhost:5432              | Database (direct)    |

## Demo Accounts

Select a persona from the login screen:

| Persona               | Role           | What they can do                    |
| --------------------- | -------------- | ----------------------------------- |
| Platform Admin        | PLATFORM_ADMIN | Everything                          |
| MAS Tenant Admin      | TENANT_ADMIN   | Manage own tenant                   |
| Worker (Sarah)        | WORKER         | Browse shifts, clock in/out         |
| Client (Mercy)        | CLIENT         | Create shifts, approve timecards    |

## Running the Acceptance Test

```bash
make demo-test
```

## Resetting the Environment

```bash
# Full reset (destroys data)
make demo-reset

# Stop without destroying
make demo-down
```

## Troubleshooting

### Containers not starting
```bash
docker compose -f docker-compose.demo.yml logs
```

### Database connection issues
```bash
docker compose -f docker-compose.demo.yml exec postgres pg_isready -U carecareer_admin
```

### Viewing service logs
```bash
docker compose -f docker-compose.demo.yml logs identity-service
docker compose -f docker-compose.demo.yml logs staffing-service
```

## Manual Database Access

```bash
docker compose -f docker-compose.demo.yml exec postgres \
  psql -U carecareer_admin -d carecareer_demo
```
