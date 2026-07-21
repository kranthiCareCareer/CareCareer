---
inclusion: always
---

# CareCareer Commit & CI/CD Standards

## 1. Commit Message Format (Conventional Commits)

```
<type>(<scope>): <short description>

<body — explain WHY, not what>

<footer — breaking changes, issue references>
```

### Types:

- `feat` — New feature (user-facing behavior change)
- `fix` — Bug fix
- `refactor` — Code restructure with no behavior change
- `test` — Adding or fixing tests only
- `docs` — Documentation only
- `chore` — Tooling, deps, CI config
- `perf` — Performance improvement
- `security` — Security fix or improvement

### Scope = service or package name:

```
feat(schedule-service): add shift cancellation with replacement workflow
fix(credential-service): correct expiry date timezone handling
test(payroll-service): add decision table for overtime calculations
refactor(shared-types): extract common event envelope type
```

### Rules:

- Subject line max 72 characters
- Body wraps at 80 characters
- Reference issue/ticket: `Closes #123` or `Refs CC-456`
- Breaking changes: `BREAKING CHANGE: removed X, use Y instead`
- One logical change per commit (don't mix features with refactoring)

## 2. Pre-Commit Checklist (Enforced by Hooks)

Before ANY commit is accepted, ALL must pass:

```bash
# 1. Format check (Prettier)
pnpm format:check

# 2. Lint check (ESLint — zero warnings allowed)
pnpm lint

# 3. Type check (TypeScript — strict mode)
pnpm type-check

# 4. Unit tests (affected packages only for speed)
pnpm test:unit --filter=[HEAD~1]

# 5. Integration tests (for the changed service)
pnpm test:integration --filter=[HEAD~1]

# 6. Coverage check (must meet thresholds)
pnpm test:coverage --filter=[HEAD~1]
```

If ANY step fails, the commit is rejected. Fix it first.

## 3. Pre-Push Checklist (CI runs full suite)

```bash
# Full test suite for affected services
pnpm test:all --filter=[origin/main]

# Build check (does it compile cleanly?)
pnpm build --filter=[origin/main]

# Security audit (known vulnerabilities)
pnpm audit --audit-level=high

# Docker build (does the container build?)
docker compose build --no-cache {affected-services}
```

## 4. CI Pipeline (GitHub Actions)

```
PR Created/Updated
    │
    ├── [Parallel]
    │   ├── Lint + Format + Type Check
    │   ├── Unit Tests + Coverage Report
    │   ├── Integration Tests (Testcontainers)
    │   ├── Security Scan (npm audit + Snyk/Trivy)
    │   └── Docker Build (all affected services)
    │
    ├── [Sequential — only if above passes]
    │   ├── E2E Tests (Docker Compose up → run tests → down)
    │   └── Coverage Gate (reject if below threshold)
    │
    └── [Post-merge to main]
        ├── Build + Tag Docker images
        ├── Push to container registry
        └── Deploy to dev environment (auto)
```

## 5. Branch Strategy

```
main (protected — always deployable)
  └── feature/{ticket}-{short-description}
       Example: feature/CC-42-shift-cancellation-flow

Rules:
- Never commit directly to main
- Feature branches from main, merge back to main
- Squash merge preferred (clean history)
- Delete branch after merge
- Rebase on main before merge (no merge commits)
```

## 6. PR Requirements

A PR is mergeable ONLY when:

- [ ] All CI checks pass (green)
- [ ] Coverage thresholds met
- [ ] At least 1 code review approval
- [ ] No unresolved conversations
- [ ] Commit messages follow convention
- [ ] Documentation updated (if behavior changed)
- [ ] No `console.log` or debug code
- [ ] No hardcoded secrets or URLs
- [ ] Affected API docs updated (OpenAPI)
- [ ] Migration is backward-compatible (if schema changed)

---
