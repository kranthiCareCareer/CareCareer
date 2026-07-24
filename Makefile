# CareCareer Local MVP Makefile
# Usage: make demo-up | make demo-seed | make demo-test | make demo-reset | make demo-down

COMPOSE_FILE := docker-compose.demo.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

.PHONY: demo-up demo-down demo-seed demo-test demo-reset demo-logs demo-status

## Start the full demo environment
demo-up:
	$(COMPOSE) up -d --build
	@echo ""
	@echo "═══════════════════════════════════════════════════"
	@echo "  CareCareer Demo Environment Starting..."
	@echo "  Web UI:      http://localhost:8080"
	@echo "  MailHog:     http://localhost:8025"
	@echo "  Identity:    http://localhost:3100"
	@echo "  Platform:    http://localhost:3001"
	@echo "  Staffing:    http://localhost:3200"
	@echo "═══════════════════════════════════════════════════"
	@echo ""
	@echo "Waiting for services to become healthy..."
	$(COMPOSE) exec -T postgres pg_isready -U carecareer_admin
	@echo "Run 'make demo-seed' to load demo data"

## Seed the demo database with synthetic data
demo-seed:
	$(COMPOSE) exec -T postgres psql -U carecareer_admin -d carecareer_demo -f /docker-entrypoint-initdb.d/01-init.sql 2>/dev/null || true
	@echo "Running migrations..."
	$(COMPOSE) exec -T identity-service sh -c "npx tsx services/identity-service/scripts/migrate.mjs" || true
	$(COMPOSE) exec -T platform-service sh -c "npx tsx services/platform-service/scripts/migrate.mjs" || true
	$(COMPOSE) exec -T staffing-service sh -c "npx tsx services/staffing-service/scripts/migrate.mjs" || true
	@echo ""
	@echo "Demo seed complete. Accounts:"
	@echo "  - Platform Admin: platform-admin"
	@echo "  - Tenant Admin:   mas-admin"
	@echo "  - Worker:         worker-sarah"
	@echo "  - Client:         client-mercy"
	@echo ""

## Run the acceptance test against the demo environment
demo-test:
	@echo "Running MVP acceptance tests..."
	node tests/acceptance/mvp-workflow.test.mjs

## Reset the demo environment (destroy and recreate)
demo-reset:
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build
	@echo "Demo environment reset. Run 'make demo-seed' to load data."

## Stop and remove the demo environment
demo-down:
	$(COMPOSE) down -v
	@echo "Demo environment stopped and volumes removed."

## Show logs from all services
demo-logs:
	$(COMPOSE) logs -f

## Show service health status
demo-status:
	$(COMPOSE) ps
