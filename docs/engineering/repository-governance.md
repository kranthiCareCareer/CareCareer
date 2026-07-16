# CareCareer — Repository Governance

Version: 1.0
Date: 2026-07-16

---

## 1. Branch Strategy

| Branch      | Purpose                  | Protection                         |
| ----------- | ------------------------ | ---------------------------------- |
| `main`      | Always-deployable trunk  | Protected (see below)              |
| `feature/*` | Short-lived feature work | No protection; deleted after merge |

### Main Branch Protection Rules

- [ ] Require pull request before merging
- [ ] Require at least 1 approving review
- [ ] Dismiss stale PR approvals when new commits are pushed
- [ ] Require status checks to pass (CI, secret-scan, dependency-review)
- [ ] Require branches to be up to date before merging
- [ ] No force pushes allowed
- [ ] No deletions allowed
- [ ] Require CODEOWNERS approval for designated paths

### Merge Policy

- Squash merge preferred (clean linear history)
- Merge commits allowed for multi-commit PRs that benefit from preserved history
- Rebase merge allowed
- Branch automatically deleted after merge

---

## 2. CODEOWNERS

Defined in `.github/CODEOWNERS`. Critical paths require specific team review:

| Path                                                    | Reviewers           | Reason                  |
| ------------------------------------------------------- | ------------------- | ----------------------- |
| `/docs/adr/`, `/docs/architecture/`, `/docs/contracts/` | Architecture team   | Architectural decisions |
| `/docs/security/`                                       | Security team       | Security requirements   |
| `/packages/`                                            | Platform team       | Shared infrastructure   |
| `**/prisma/`, `**/migrations/`                          | Database team       | Schema changes          |
| `/.github/workflows/`                                   | Platform + Security | CI/CD pipeline          |
| Root config files                                       | Platform team       | Build system stability  |

---

## 3. Commit Convention

Format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `security`

Scope: package or service name (e.g., `platform-service`, `auth`, `ci`)

Examples:

```
feat(staffing-service): add shift creation endpoint
fix(workforce-service): correct RLS policy for credentials
chore(ci): add container vulnerability scanning
docs(adr): add ADR-009 for search infrastructure
```

---

## 4. PR Requirements

Before a PR can merge:

1. All CI status checks pass
2. At least 1 code review approval
3. CODEOWNERS approval (for designated paths)
4. No unresolved review conversations
5. Branch is up to date with main
6. PR template sections completed

---

## 5. Dependency Management

- All dependencies use exact versions (no `^` or `~` in production packages)
- Root devDependencies may use exact versions for shared tooling
- Dependency updates reviewed weekly
- New dependencies require: license check, security review, maintenance assessment
- Denied licenses: GPL-3.0, AGPL-3.0 (see dependency-review workflow)

---

## 6. Versioning

- Packages use semantic versioning
- Changesets coordinate multi-package version bumps
- Container images tagged with: `{service}:{git-sha}` (immutable)
- No mutable `latest` tag in production deployments
- Image labels include: repository, commit SHA, build date, version

---

## 7. Security

- Secret scanning runs on every PR and push (Gitleaks)
- Dependency vulnerabilities reviewed on every PR (dependency-review-action)
- CodeQL static analysis runs weekly and on PRs
- Container scanning runs when Dockerfiles change
- Findings must be addressed before merge (HIGH/CRITICAL block)

---

## 8. Release Process

1. Feature branches merge to main via PR
2. Main is always deployable
3. Releases tagged with semantic version when deploying
4. Deployment to environments controlled by CI pipeline
5. No direct deployment from developer workstations

---

## 9. Local Development

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker Desktop

# Clone and install
git clone <repo-url>
cd carecareer
corepack enable
pnpm install --frozen-lockfile

# Start infrastructure
docker compose up -d

# Run quality checks
pnpm lint
pnpm typecheck
pnpm test

# Build all packages
pnpm build

# Start development
pnpm dev
```
