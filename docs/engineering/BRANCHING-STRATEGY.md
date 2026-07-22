# CareCareer Branching & PR Strategy

## Branch Model

```
master (protected — always deployable, production-ready code)
  │
  └── develop (protected — integration branch, next release candidate)
        │
        ├── feature/CC-{ticket}-{short-description}
        │     Feature development branches
        │
        ├── agent/{milestone}-{description}
        │     AI agent autonomous work branches
        │
        ├── fix/CC-{ticket}-{short-description}
        │     Bug fix branches
        │
        └── release/v{major}.{minor}.{patch}
              Release preparation branches
```

## Branch Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/CC-{ticket}-{description}` | `feature/CC-42-shift-cancellation` |
| Bug fix | `fix/CC-{ticket}-{description}` | `fix/CC-87-timezone-validation` |
| Agent work | `agent/{milestone}-{description}` | `agent/gp-05-gp-06-v2` |
| Release | `release/v{version}` | `release/v0.2.0` |
| Hotfix | `hotfix/CC-{ticket}-{description}` | `hotfix/CC-99-auth-bypass` |

## Protected Branches

### `master` — Production

**Settings to apply in GitHub:**
- Require pull request before merging
- Required approving reviews: 1 (increase to 2 after team growth)
- Dismiss stale pull request approvals when new commits are pushed
- Require review from code owners
- Require status checks to pass before merging:
  - `CI` (lint, typecheck, test, build)
  - `Secret Scanning` (gitleaks)
  - `Code Security` (CodeQL)
- Require conversation resolution before merging
- Require linear history (squash or rebase merge only)
- Do not allow bypassing the above settings
- Restrict who can push: no direct pushes (PR only)
- Do not allow force pushes
- Do not allow deletions

### `develop` — Integration

**Settings to apply in GitHub:**
- Require pull request before merging
- Required approving reviews: 1
- Require status checks to pass:
  - `CI`
  - `Secret Scanning`
- Require linear history
- Do not allow force pushes

## PR Flow

### Standard Feature Flow

```
1. Create branch from develop:
   git switch develop && git pull
   git switch -c feature/CC-42-shift-cancellation

2. Develop, commit (conventional messages):
   git commit -m "feat(shifts): add cancellation flow"

3. Push and create PR into develop:
   git push -u origin feature/CC-42-shift-cancellation
   → PR target: develop

4. PR reviewed, CI green, approved, squash-merged into develop

5. When develop is stable for release:
   PR from develop → master (release merge)
```

### Agent Autonomous Flow

```
1. Agent creates branch from master or develop:
   git switch -c agent/gp-07-credentials

2. Agent works autonomously, commits, pushes periodically

3. Agent creates draft PR when checkpoint reached
   → PR target: develop (or master for isolated milestones)

4. Human reviews, agent addresses feedback

5. Squash-merged when CI green + approval
```

### Hotfix Flow (production emergency)

```
1. Branch from master:
   git switch master && git pull
   git switch -c hotfix/CC-99-auth-bypass

2. Fix, test, commit

3. PR into master (expedited review, 1 approval)
   After merge: cherry-pick or merge master → develop
```

## Merge Strategy

| Target | Merge Type | Reason |
|--------|-----------|--------|
| develop ← feature | Squash merge | Clean history, one logical commit |
| master ← develop | Merge commit | Preserves develop integration history |
| master ← hotfix | Squash merge | Minimal change, linear |

## Required Status Checks

### For PRs into `master`:

```yaml
required_status_checks:
  - CI / Lint, Type-check, Test, Build
  - Secret Scanning / Detect secrets
  - Code Security / CodeQL Analysis
  - Dependency Review / Review dependency changes
```

### For PRs into `develop`:

```yaml
required_status_checks:
  - CI / Lint, Type-check, Test, Build
  - Secret Scanning / Detect secrets
```

## PR Requirements

### Title Format
```
type(scope): short description (max 70 chars)
```

### Body Template
The repository already has `.github/pull_request_template.md`.

### Labels
- `security` — security-relevant changes
- `breaking` — breaking API or schema changes
- `milestone:gp-XX` — golden path milestone
- `agent-work` — AI agent produced code
- `needs-review` — ready for human review

## Creating `develop` Branch

Since `develop` doesn't exist yet, create it from current master:

```bash
git switch master
git pull --ff-only
git switch -c develop
git push -u origin develop
```

## Applying Branch Protection via GitHub UI

1. Go to: Settings → Branches → Add branch protection rule
2. Branch name pattern: `master`
3. Check all options listed above
4. Save changes
5. Repeat for `develop` with its specific settings

## CODEOWNERS

The existing `.github/CODEOWNERS` file defines team ownership.
For a personal repository, ensure the account owner is listed:

```
* @kranthiCareCareer
docs/ @kranthiCareCareer
services/ @kranthiCareCareer
packages/ @kranthiCareCareer
.github/ @kranthiCareCareer
```
