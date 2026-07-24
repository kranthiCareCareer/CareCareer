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
	@echo "Running staffing service migrations..."
	$(COMPOSE) exec -T staffing-service sh -c "node scripts/demo-run-migrations.mjs"
	@echo "Seeding demo data..."
	$(COMPOSE) exec -T staffing-service sh -c "node scripts/demo-seed-data.mjs"
	@echo ""
	@echo "Demo seed complete. Accounts:"
	@echo "  - Platform Admin: platform-admin"
	@echo "  - Tenant Admin:   mas-admin"
	@echo "  - Worker:         worker-sarah"
	@echo "  - Client:         client-mercy"
	@echo ""

## Run the acceptance test against the demo environment
demo-test:
	@echo "Running MVP acceptance tests (20 steps)..."
	node tests/acceptance/mvp-workflow.test.mjs
	@echo ""
	@echo "Running notification proof (8 steps)..."
	node tests/acceptance/notification-proof.test.mjs
	@echo ""
	@echo "Running browser tests (15 tests)..."
	node tests/e2e/demo-browser-tests.cjs

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
