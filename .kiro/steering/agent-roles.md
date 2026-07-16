---
inclusion: always
---

# CareCareer Agent Roles & Responsibilities

## Development Agents — Who Does What

### 🛠️ Dev Agent (Implementation)

**Responsibility:** Write production code following all standards.

**Before writing code:**

- Read the relevant domain model and existing code
- Check if the pattern already exists elsewhere (follow it)
- Verify requirements are clear (ask if ambiguous)

**While writing code:**

- Follow coding-standards.md strictly
- Write code AND tests together (TDD preferred)
- Add JSDoc comments on all public APIs
- Ensure TypeScript strict mode passes
- Use domain-driven structure (entity → use case → controller)

**Before marking done:**

- All unit tests pass
- All integration tests pass
- Coverage meets thresholds (85%+ overall, 95%+ for domain)
- Lint passes with zero warnings
- Format is correct (Prettier)
- Type check passes (tsc --noEmit)
- No `console.log`, no `any`, no `@ts-ignore`
- Commit message follows conventional format

---

### 🧪 Testing Agent (Quality Assurance)

**Responsibility:** Ensure code correctness, coverage, and regression safety.

**What it verifies:**

- Unit test coverage per file and per function
- Integration tests exercise real database (via Testcontainers)
- Edge cases covered (null, empty, max length, boundary values)
- State machine tests: every valid AND invalid transition tested
- Tenant isolation tested (can't read across tenants)
- Error paths tested (what happens on failure?)
- Performance: no test takes >5s individually
- Regression: existing tests still pass after changes

**Test quality checks:**

- No flaky tests (random failures)
- No order-dependent tests (can run in any sequence)
- No shared state between tests (proper setup/teardown)
- Descriptive test names (reads like requirements)
- Factories used for test data (no raw literals)

**When to escalate:**

- Ambiguous requirements that prevent test writing
- Discovered bugs in existing code during testing
- Performance degradation detected
- Coverage impossible to achieve without refactoring

---

### 🚀 Deployment Agent (CI/CD)

**Responsibility:** Build, deploy, and ensure environment health.

**Manages:**

- Docker image builds (multi-stage, minimal size)
- Docker Compose for local development
- CI pipeline configuration (GitHub Actions)
- Environment variable management
- Database migration execution
- Health check verification post-deploy
- Rollback procedures

**Rules:**

- Zero-downtime deployments (rolling updates)
- Migrations must be backward-compatible
- Secrets never in source code or Docker images
- Every deployment is tagged and traceable to a commit
- Rollback must be possible within 5 minutes
- Staging mirrors production exactly

**Local development guarantee:**

```bash
# This must ALWAYS work on any developer's machine:
docker compose up -d     # Start infrastructure
pnpm install             # Install dependencies
pnpm db:migrate          # Run migrations
pnpm db:seed             # Seed dev data
pnpm dev                 # Start all services
# → Platform is running at localhost
```

---

### 📡 SRE Agent (Monitoring & Reliability) — Phase 2

**Responsibility:** Observe, alert, and maintain system health.

**Manages (when activated):**

- Dashboard creation (Grafana)
- Alert rule configuration
- SLO definition and tracking
- Incident response runbooks
- Capacity planning
- Cost monitoring
- Performance baseline tracking

**Observability stack:**

- Metrics: Prometheus + prom-client
- Logging: Structured JSON → CloudWatch (or ELK locally)
- Tracing: OpenTelemetry → Jaeger (local) / X-Ray (AWS)
- Dashboards: Grafana

**Alerts defined per service:**

- Error rate > 1% sustained for 5 minutes
- p95 latency > 500ms sustained for 5 minutes
- Queue depth growing for 10+ minutes
- Health check failing for 2+ consecutive checks
- Database connection pool exhaustion
- Disk/memory usage > 80%

---

## Agent Interaction Rules

1. **Dev Agent** writes code + tests → commits
2. **Testing Agent** reviews coverage + quality → approves or rejects
3. **Deployment Agent** builds + deploys → confirms healthy
4. **SRE Agent** monitors → alerts if problems detected

### Escalation Chain:

- Testing Agent finds issue → Dev Agent fixes
- Deployment Agent build fails → Dev Agent fixes
- SRE Agent detects production issue → all agents involved in resolution

### When ANY agent is uncertain:

**ASK THE REQUIREMENTS.** Do not guess. Do not assume.
A 5-minute conversation saves a 5-hour rework cycle.

---
