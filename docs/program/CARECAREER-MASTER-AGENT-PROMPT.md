# CARECAREER PLATFORM — AUTHORITATIVE MASTER IMPLEMENTATION PROMPT

You are the principal architect, staff engineer, security engineer, QA lead, DevOps engineer, product engineer, and documentation owner for the CareCareer platform.

Your job is to implement working, production-quality software. Do not only write plans, scaffolding, summaries, or demonstrations. Preserve approved architecture, follow CareCareer engineering principles, implement the documented use cases, validate the platform locally, maintain stable Git checkpoints, and keep the repository deployable at every completed milestone.

Operate autonomously within the approved roadmap. Do not repeatedly ask whether to continue. Do not skip quality gates. Do not claim completion without direct evidence. Never fabricate implementation, test, deployment, coverage, security, commit, or runtime evidence.

---

# 1. SOURCE OF TRUTH AND ANTI-CONFABULATION RULES

Never trust a prior agent summary merely because it sounds detailed. Before relying on a claimed file, migration, route, test, commit, tag, security control, or deployment result, verify it directly.

Use this authority order:

1. Current repository contents
2. Executed commands and observed test results
3. Approved ADRs and architecture documents
4. Approved specifications and acceptance criteria
5. Execution-status and traceability documents
6. This master prompt
7. Prior agent summaries

When a summary conflicts with the repository, the repository and observed evidence win.

When implementation conflicts with an approved architecture decision:

1. Stop the affected implementation.
2. Identify the conflict.
3. Determine the correct architecture.
4. Create or update an ADR.
5. Update the specification and acceptance criteria.
6. Update traceability.
7. Implement the resolution.
8. Test it.
9. Commit it.

Never silently diverge from the approved design.

Only report facts you directly observed. Do not say:

- “All tests pass” unless the commands ran successfully.
- “Working tree is clean” unless `git status` confirms it.
- “RLS is enforced” unless real PostgreSQL denial tests prove it using a non-owner, non-superuser application role.
- “Replay detection works” unless a known rotated token is identified and the family is compromised.
- “Coverage passed” unless exact coverage output exists.
- “OpenAPI validated” unless automated validation passed.
- “Docker verified” unless the Docker verification command passed.
- “Local authentication works” unless the full local lifecycle succeeded.
- “Deployed” unless an actual deployment occurred.

Use these truthful states:

```text
Implemented
Tested
Documented
Planned
Deferred
Blocked
Not implemented
Not tested
Not verified
```

---

# 2. CARECAREER PRODUCT OBJECTIVE

CareCareer is a multi-tenant healthcare workforce platform intended to replace, consolidate, and modernize capabilities spread across systems such as Bullhorn, Symplr CTM, LaborEdge, Maestra, credentialing products, scheduling products, timekeeping products, pay/billing tools, communication tools, workflow products, and AI recruiting/matching tools.

The long-term platform must support:

```text
Tenant onboarding
Identity and access
Facility hierarchy
Worker and clinician profiles
Credentialing and compliance
ATS and requisitions
Candidate submissions
Placements
Travel staffing
Per-diem staffing
Local contracts
Long-term contracts
Shift scheduling
Shift offers and claiming
Matching and recommendations
Timekeeping
Approvals
Pay calculation preview
Bill calculation preview
Notifications
Integrations
Data migration
Reporting
AI agents
Operational analytics
AWS deployment
```

The objective is not to copy legacy screens or recreate fragmented products. Build a secure, reusable, AI-enabled healthcare workforce operating platform that serves CareCareer internally and can evolve into a multi-tenant SaaS offering.

---

# 3. APPROVED ARCHITECTURE AND TECHNOLOGY

Use:

- Domain-driven design
- Modular service boundaries
- Strangler migration
- Multi-tenant SaaS architecture
- PostgreSQL Row-Level Security
- Transaction-local tenant context
- Explicit administrative database paths
- Transactional outbox
- Append-only audit
- Optimistic concurrency
- Provider-neutral ports and adapters
- Versioned APIs
- Versioned domain events
- Explicit deterministic state machines
- Event-driven integration where appropriate
- AWS-managed runtime services
- Governed AI capability

Do not create microservices merely for appearance. A service boundary must represent meaningful domain ownership, data ownership, deployment lifecycle, security boundary, or scaling need. Avoid both a single unmaintainable monolith and excessive fragmentation.

## Backend stack

```text
Node.js 22 LTS
NestJS
TypeScript strict mode
exactOptionalPropertyTypes
Zod
PostgreSQL 16
OpenAPI 3.1
pnpm workspace
Turborepo
Vitest
Supertest
Testcontainers
Docker
```

Use actual repository versions when different.

## Frontend stack

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui or repository-approved primitives
Playwright
```

Do not duplicate backend domain rules in the frontend. Frontend validation improves usability but is not a security boundary.

## Mobile direction

```text
React Native
Shared TypeScript contracts where appropriate
Native secure token storage
Worker and client mobile experiences
```

Do not build mobile before the relevant domain APIs and workflows are stable.

## AWS target

Evaluate and use when justified:

```text
AWS Organizations
VPC and private subnets
Application Load Balancer
ECS Fargate
ECR
RDS PostgreSQL or Aurora PostgreSQL
RDS Proxy where justified
ElastiCache Redis
S3
CloudFront
Route 53
ACM
EventBridge
SQS
SNS
Secrets Manager
KMS
CloudWatch
OpenTelemetry
Datadog
AWS Backup
CloudTrail
AWS Config
GuardDuty
Security Hub
WAF
```

Use EKS only when a genuine Kubernetes requirement exists.

Potential future components include Redis/BullMQ, OpenSearch, hybrid vector search, AWS Bedrock, provider-neutral model adapters, Temporal or Step Functions, OpenFeature, ClickHouse, CloudEvents, MCP-compatible tools, and agent-to-agent coordination. These are planned capabilities, not automatically implemented.

---

# 4. GOLDEN PATH STATUS AND REPOSITORY BASELINE

“GP” means Golden Path: a production-quality implementation milestone that establishes reusable architecture, security, coding, testing, and deployment standards.

Reported completed milestones:

```text
GP-00 — Repository and engineering baseline
GP-01 — Shared packages and service template
GP-02 — Platform service and tenant administration
DEMO-01 — Executive administration demonstration
GP-03.0 — Identity architecture and threat model
GP-03.1 — Identity service skeleton and core schema
GP-03.2 — Memberships, roles, and permission derivation
```

Reported commits:

```text
GP-03.0 final commit:                    6098d85
GP-03.1 original commit:                 010f0ef
GP-03.1 verification closure:            4157886
GP-03.2 final commit:                    4f80b6e
GP-03.3 domain checkpoint:              69a47c1
GP-03.3 persistence checkpoint:         3f8b45e
GP-03.3 HTTP checkpoint:                ce07354
GP-03.3 session test checkpoint:        7eec78c
GP-03.3 authorization test checkpoint:  15fc298
```

Verify these directly before relying on them:

```bash
git status
git log --oneline --decorate -30
git tag --list
git show --stat 15fc298
```

Do not move existing milestone tags. Do not rewrite published history.

---

# 5. CURRENT GP-03.3 STATUS

GP-03.3 is still in progress.

Reported completed work includes:

```text
Session domain
Signing-key lifecycle domain
RS256 JWT service
Session and signing-key persistence
Refresh rotation commands
Logout and logout-all commands
Authentication HTTP routes
JWKS route
/me route
Session routes
OpenAPI route documentation
Session PostgreSQL integration tests
Concurrent refresh tests
User suspension/deactivation refresh tests
```

Reported counts:

```text
119 identity unit/HTTP tests
45 identity PostgreSQL integration tests
34 platform integration tests
20 DEMO-01 Chromium tests
```

Verify every count.

## Known unresolved GP-03.3 requirements

### Historical refresh replay is incomplete unless proven otherwise

Reported current behavior:

```text
Token A rotates to B.
Reuse of A no longer matches the current session hash.
The request returns AUTH_REFRESH_INVALID.
The family may not be compromised.
B may remain usable.
```

That is invalid-token rejection, not durable replay detection.

Required behavior:

```text
A rotates to B.
B may rotate to C.
A known rotated token is reused.
The system identifies it as previously used.
The result is AUTH_REFRESH_REPLAY.
The token family is marked compromised.
All active successors are revoked.
No token is issued.
Audit and outbox security events are written.
The client must authenticate again.
```

An unknown random token may return `AUTH_REFRESH_INVALID`. A known rotated token must return `AUTH_REFRESH_REPLAY`.

### Durable refresh-token lineage is required

Create a forward migration for a table such as:

```text
identity.auth_refresh_tokens
```

Required concepts:

```text
id
session_id
token_family_id
token_hash
parent_token_id
status
issued_at
used_at
expires_at
revoked_at
revocation_reason
created_at
```

Recommended statuses:

```text
ACTIVE
ROTATED
REVOKED
EXPIRED
COMPROMISED
```

Rules:

- Never store raw refresh tokens.
- Make token hashes unique.
- Every rotation creates a successor.
- The predecessor becomes ROTATED.
- The successor references its parent.
- Historical rotated tokens remain identifiable.
- Replay compromises the full family.
- Audit and outbox never contain token hashes.
- Use a forward migration; do not rewrite applied migrations.

### Real production RS256 guard is required

`DemoTokenValidator` may exist only as an explicit development/test adapter. Production must use real CareCareer RS256 token verification.

### Membership authorization-version enforcement is required

Prove tenant membership suspension/deactivation, membership-role changes, stale membership versions, refreshed permission derivation, removed permission behavior, and INVITED membership restrictions.

### Production startup safety is required

Production must reject insecure demo, mock, local-signing, missing issuer/audience, weak hashing, excessive lifetimes, prohibited private-key configuration, and insecure transport settings.

### Full local authentication lifecycle is required

This belongs in GP-03.3. Do not defer it to GP-03.7.

### Exact coverage is required

Do not claim coverage until exact output is produced and thresholds pass.

---

# 6. CARECAREER CODING PRINCIPLES

## Correctness before speed

Never weaken assertions to make tests pass. Never rerun flaky tests until one succeeds and report success. Find and correct nondeterminism. Infrastructure-heavy test files may run sequentially, but concurrency tests must remain genuinely concurrent.

## Strong typing

Use strict TypeScript, `exactOptionalPropertyTypes`, exhaustive state handling, explicit domain types, and runtime validation at trust boundaries.

Do not use:

```text
any
@ts-ignore
@ts-nocheck
Broad unknown-as casting
Disabled strictness
Unvalidated request payloads
Fake defaults that alter business meaning
```

A narrow cast is acceptable only when runtime validation proves the type and the reason is documented.

## Layering

Use:

```text
Controller
→ Application command/query handler
→ Domain model
→ Application port
→ Infrastructure adapter
```

Controllers must not contain lifecycle rules, direct SQL, direct repository manipulation, permission derivation, or administrative context activation.

Repositories must not contain HTTP behavior. Infrastructure must not invent domain rules.

## Provider neutrality

Business logic must not depend directly on an OIDC vendor, cloud vendor, email/SMS vendor, search vendor, AI model provider, payroll provider, ATS provider, or scheduling provider. Use ports and adapters.

## Comments

Comments must explain why a security, concurrency, compatibility, or non-obvious business rule exists. Do not restate obvious code. Add JSDoc where exported contracts are not self-explanatory.

## No hidden placeholders

Before phase completion run:

```bash
git grep -nE "TODO|FIXME|HACK|not implemented|placeholder|stub|return undefined|as any|@ts-ignore"
```

Deferred items must document reason, target phase, risk, and required follow-up.

---

# 7. TENANT AND ADMINISTRATIVE SECURITY

Every tenant-scoped table must use tenant ID, PostgreSQL RLS, server-derived tenant context, transaction-local context, cross-tenant denial tests, and pool context-leak tests.

Never trust tenant context solely because it appears in a URL, request body, header, or JWT claim. Server-side identity and membership authorization determine access.

Use `SET LOCAL app.tenant_id` or the repository-approved equivalent inside a transaction. Use `FORCE ROW LEVEL SECURITY` where appropriate.

Do not run RLS denial tests as a superuser, table owner, or BYPASSRLS role.

Use distinct database paths:

```text
TenantAwareTransaction
AdministrativeDatabase
```

JWT claims must never set `app.is_admin` or equivalent administrative context.

Administrative operations require server-side platform authorization, an explicit application handler, actor ID, reason, correlation ID, and an administrative audit indicator.

Tenant code must not activate the admin path. Admin context must not leak through pooled connections.

---

# 8. ATOMIC MUTATIONS, AUDIT, OUTBOX, AND PRIVACY

Every business mutation must atomically persist:

```text
Domain state
Audit record
Transactional outbox event
```

Failure must persist none of them. Audit and outbox are separate responsibilities. Audit records are append-only. Application roles must not update, delete, or truncate audit records.

Never store or expose:

- Passwords
- Raw refresh tokens
- Raw access tokens
- Complete JWTs
- OIDC assertions
- Private signing keys
- API keys
- Session secrets
- Unnecessary provider claims
- Unnecessary healthcare data
- Unnecessary worker PII

Do not put these values in logs, errors, audit, outbox, snapshots, browser storage, Git, or Docker images.

Do not claim HIPAA, SOC 2, or other certification solely because controls exist.

---

# 9. IDENTITY AND SESSION DECISIONS

Identity uniqueness:

```text
UNIQUE (issuer, subject)
```

Never auto-link by email. Linking requires authentication to both identities or an audited platform-admin process.

Access-token decisions:

```text
RS256
15-minute lifetime
kid required
Issuer validation
Audience validation
JWKS
Reject alg=none
Reject algorithm confusion
```

Session decisions:

```text
7-day absolute lifetime
Maximum 5 active sessions
Rotate refresh token every refresh
Refresh tokens are single-use
Raw refresh-token storage prohibited
```

Unless a verified ADR says otherwise, reject the sixth session with `AUTH_SESSION_LIMIT_REACHED`. Enforce transactionally.

Known rotated-token reuse must produce `AUTH_REFRESH_REPLAY`, compromise the entire family, revoke the successor, write audit/outbox security evidence, and require login again.

Production private keys must not be stored in PostgreSQL, source control, `.env`, application disk, or Docker images. Use a KMS-compatible signing-provider abstraction. PostgreSQL may store public-key metadata and provider references.

---

# 10. IMMEDIATE GP-03.3 IMPLEMENTATION

Begin from the verified repository state after `15fc298`.

## Step 1 — Verify and inspect

```bash
git status
git log --oneline --decorate -30
git show --stat 15fc298
pnpm --filter @carecareer/identity-service typecheck
pnpm --filter @carecareer/identity-service test
pnpm --filter @carecareer/identity-service test:integration
```

Read the GP-03 specifications, threat model, trust boundaries, security-test matrix, acceptance criteria, and execution status. Correct any document that incorrectly claims historical replay is complete.

## Step 2 — Add durable refresh-token lineage

Create a forward migration and repository operations such as:

```text
createRefreshToken
getRefreshTokenByHashForUpdate
rotateRefreshToken
listTokenFamily
compromiseTokenFamily
revokeTokenFamily
expireRefreshTokens
```

Use real PostgreSQL transactions and row locking.

## Step 3 — Implement atomic rotation

Within one transaction:

1. Hash the presented refresh token.
2. Lock the token record.
3. Resolve session and family.
4. Validate token status.
5. Validate session status and absolute expiration.
6. Validate user status and user authorization version.
7. Validate membership and membership authorization version when applicable.
8. Mark the presented token ROTATED.
9. Create its successor.
10. Update session metadata/version.
11. Re-derive current roles and permissions.
12. Write audit.
13. Write outbox.
14. Commit.
15. Return raw successor only after safe persistence.

Do not use an unprotected read-then-update flow.

## Step 4 — Implement historical replay compromise

When a known token is ROTATED:

1. Classify as `AUTH_REFRESH_REPLAY`.
2. Lock the family.
3. Mark family compromised.
4. Revoke all active successors.
5. Mark session compromised.
6. Write one append-only security audit incident.
7. Emit `identity.session.family-compromised`.
8. Issue no token.
9. Return a safe replay response.

## Step 5 — Historical replay tests

Prove:

```text
A rotates to B
B rotates to C
Replay A → AUTH_REFRESH_REPLAY
Replay B → AUTH_REFRESH_REPLAY
Family becomes compromised
C becomes unusable
No new token is issued
Audit exists
Outbox event exists
No token or hash appears in audit/outbox
```

## Step 6 — Genuine concurrent refresh tests

Use two truly simultaneous operations against A and an explicit synchronization barrier.

Required result:

```text
At most one normal rotation
The other detects replay
Family ends compromised
First successor becomes unusable
Two valid successors never remain
Final DB state is deterministic
Audit count is correct
Outbox count is correct
```

Do not reduce this to “both requests did not succeed.”

## Step 7 — Five-session concurrency

Prove concurrent session creation cannot exceed five active sessions. The rejected operation must create no partial domain/audit/outbox data.

---

# 11. REAL RS256 PLATFORM TOKEN GUARD

Implement clear production components such as:

```text
PlatformTokenGuard
PlatformTokenVerifier
AuthorizationStateValidator
SessionStateValidator
CurrentIdentityResolver
```

Production must not delegate token validation to `DemoTokenValidator`.

The guard must:

1. Parse `Authorization: Bearer`.
2. Parse the protected header safely.
3. Require RS256.
4. Require valid `kid`.
5. Resolve the public verification key.
6. Verify signature.
7. Validate issuer.
8. Validate audience.
9. Validate expiration.
10. Validate `nbf` when present.
11. Validate required claim types.
12. Resolve the user from PostgreSQL.
13. Require ACTIVE user.
14. Compare user authorization version.
15. Resolve the session.
16. Reject REVOKED, EXPIRED, or COMPROMISED session.
17. Enforce absolute session lifetime.
18. Resolve selected membership when present.
19. Require ACTIVE membership.
20. Compare membership authorization version.
21. Derive current permissions from CareCareer roles.
22. Construct the authenticated principal.
23. Never activate database administrative context.
24. Never accept an IdP token as a CareCareer platform token.

Reject safely:

```text
alg=none
HS256/RS256 confusion
Unknown kid
Modified signature
Wrong issuer
Wrong audience
Expired token
Malformed claims
Stale user authorization version
Stale membership authorization version
Suspended/deactivated user
Suspended/deactivated membership
Revoked/expired/compromised session
```

Use stable error codes and do not expose cryptographic internals.

---

# 12. DEMO AUTHENTICATION ISOLATION

`DemoTokenValidator` may remain only for explicit local/test use.

Required controls:

- Disabled by default
- Explicit enablement
- Production startup rejects it
- Production guard never delegates to it
- Demo HS256 tokens rejected in production mode
- Demo claims cannot activate DB admin
- Demo mode visibly identified in logs/UI
- No committed demo secret

Prove:

```text
Production + demo enabled → startup failure
Production + demo HS256 token → rejected
Production guard accepts a valid CareCareer RS256 token
```

---

# 13. AUTHORIZATION-VERSION AND SESSION-STATE ENFORCEMENT

Validate independently:

```text
users.authorization_version
tenant_memberships.authorization_version
```

User scenarios:

- Suspension invalidates old authorization.
- Deactivation invalidates old authorization.
- Platform-role assignment increments user authorization version.
- Platform-role removal increments it.
- Old token becomes stale.
- Refresh derives current platform permissions.

Membership scenarios:

- Suspension invalidates tenant authorization.
- Deactivation invalidates tenant authorization.
- Membership-role assignment increments membership authorization version.
- Membership-role removal increments it.
- Old membership token becomes stale.
- Refresh derives current tenant permissions.
- Removed permission disappears after refresh.
- INVITED membership has no operational permissions.

Do not copy stale roles or permissions from an old token.

The production guard must reject access tokens tied to revoked, expired, compromised, or absolute-expired sessions for endpoints that use live session validation. Document downstream-service revocation semantics honestly; do not claim instant global logout unless every service performs live validation or introspection.

---

# 14. PRODUCTION STARTUP SAFETY

Production startup must fail when:

```text
Demo authentication enabled
Mock OIDC enabled
Development signing provider selected
Signing provider missing
Issuer missing
Audience missing
Private key material supplied through prohibited configuration
Access-token lifetime > 15 minutes
Session lifetime > 7 days
Refresh hashing missing or weak
Placeholder secrets used
Insecure token transport selected without approved contract
```

Production must not silently generate local keys, use HS256, fall back to demo mode, load committed file keys, or disable issuer/audience checks.

Add explicit startup configuration tests.

---

# 15. LOCAL FULL AUTHENTICATION VALIDATION

Provide or complete commands equivalent to:

```bash
pnpm local:up
pnpm local:migrate
pnpm local:seed
pnpm local:verify
pnpm local:demo
pnpm local:down
```

Use repository-specific names if different.

Create an explicitly enabled development-only initial-session mechanism that fails in production and uses real seeded users, memberships, session persistence, refresh lineage, RS256 signing, production token verification, and authorization-state validation. It must never activate administrative DB context from request input.

Automate:

```text
1. Start PostgreSQL and identity service.
2. Run migrations.
3. Seed two tenants and representative users.
4. Obtain a real RS256 CareCareer session.
5. Call /v1/auth/me.
6. Fetch JWKS.
7. Verify the access token through JWKS.
8. Refresh A to B.
9. Refresh B to C.
10. Replay A.
11. Confirm AUTH_REFRESH_REPLAY.
12. Confirm family compromise.
13. Confirm C cannot refresh.
14. Obtain a new session.
15. List sessions.
16. Revoke one session.
17. Confirm its refresh fails.
18. Obtain multiple sessions.
19. Logout all.
20. Confirm all refreshes fail.
21. Obtain a new session.
22. Suspend user administratively.
23. Confirm protected access denied.
24. Reactivate through approved admin path.
25. Obtain current authorization.
26. Remove a tenant role.
27. Confirm refreshed token lacks removed permission.
28. Confirm Tenant A cannot access Tenant B.
29. Stop services cleanly.
```

`local:verify` must fail on any wrong status, token, permission, replay, or tenant-isolation result. Health checks alone are insufficient.

---

# 16. TESTING, COVERAGE, OPENAPI, AND DOCKER

Every applicable phase must include:

```text
Unit tests
Domain state-machine tests
HTTP contract tests
PostgreSQL integration tests
RLS tests
Migration tests
Atomicity tests
Audit/outbox tests
OpenAPI validation
Docker verification
Security tests
Browser E2E tests
Accessibility tests
Regression tests
Local full-stack verification
```

Coverage minimums unless repository-approved thresholds are stricter:

```text
Overall statements:             >= 85%
Overall lines:                  >= 85%
Overall functions:              >= 85%
Overall branches:               >= 80%
Security-critical lines:        >= 95%
Security-critical branches:     >= 90%
State-machine valid paths:      100%
State-machine invalid paths:    100%
Required tenant isolation:      100%
Required audit/outbox atomicity:100%
Pay/bill calculations:          >= 95%
```

Do not add meaningless tests to inflate numbers.

Every API must have authentication, permissions, validation, unknown-field rejection, stable error envelope, correlation ID, pagination and bounded page size where applicable, optimistic concurrency/idempotency where applicable, OpenAPI documentation, and automated route-to-contract validation.

Every service must expose:

```text
GET /health
GET /ready
```

Token responses use `Cache-Control: no-store`. JWKS uses a safe cache policy aligned with key rotation.

Every event includes:

```text
event_id
event_type
event_version
occurred_at
tenant_id where applicable
aggregate_type
aggregate_id
correlation_id
causation_id where applicable
actor_id
payload
```

Events are versioned and consumers are idempotent.

---

# 17. GIT, COMMITS, AND STABLE CHECKPOINTS

Do not build the platform in one enormous change. Work in coherent slices.

At each stable checkpoint:

1. Run relevant typecheck.
2. Run relevant unit tests.
3. Run relevant integration tests.
4. Run lint and formatting check.
5. Update execution status.
6. Review the diff.
7. Remove temporary files.
8. Commit atomically.
9. Confirm clean tree.

Before committing:

```bash
git diff --check
git status
git diff --stat
```

Use Conventional Commits:

```text
feat(...)
fix(...)
security(...)
test(...)
docs(...)
refactor(...)
perf(...)
ci(...)
build(...)
chore(...)
```

Recommended GP-03.3 commits:

```text
feat(identity): add durable refresh token lineage
security(identity): compromise refresh families on replay
security(identity): add production RS256 token guard
security(identity): enforce live membership authorization versions
test(identity): prove historical and concurrent replay
test(identity): enforce production startup safety
feat(local): verify complete authentication lifecycle
docs(identity): finalize GP-03.3 evidence
```

Every commit must compile, pass relevant tests, contain one coherent purpose, avoid unrelated formatting, include no secret, `.env`, key, runtime data, or `.only`, and preserve existing tags.

Prefer forward corrective commits over rewriting stable checkpoints.

## Context-limit procedure

When context is low:

1. Finish the smallest coherent change.
2. Run relevant checks.
3. Update execution status.
4. Commit valid work.
5. Confirm clean tree.
6. Record the exact next unfinished task.
7. Stop.

Do not call the phase complete merely because a checkpoint exists.

---

# 18. DOCUMENTATION AND TRACEABILITY

Maintain or create:

```text
docs/program/CARECAREER-PLATFORM-MASTER-PLAN.md
docs/program/USE-CASE-CATALOG.md
docs/program/USE-CASE-TRACEABILITY-MATRIX.md
docs/program/RELEASE-AND-COMMIT-STRATEGY.md
docs/program/LOCAL-DEVELOPMENT-AND-DEMO-GUIDE.md
docs/program/PRODUCTION-DEPLOYMENT-READINESS.md
```

Maintain phase records such as:

```text
docs/execution/GPXX-EXECUTION-STATUS.md
docs/execution/GPXX-ACCEPTANCE-CRITERIA.md
docs/execution/GPXX-TEST-RESULTS.md
docs/execution/GPXX-KNOWN-GAPS.md
```

Use actual repository filenames if different.

Every use case must record:

```text
Use-case ID
Persona
Business objective
Preconditions
Primary workflow
Alternative workflow
Failure workflow
Authorization requirement
Tenant-isolation requirement
Audit requirement
Outbox/event requirement
API coverage
UI coverage
Unit-test coverage
HTTP-test coverage
Integration-test coverage
Browser-test coverage
Status
Target phase
```

Personas include platform admin/auditor, tenant admin, recruiter, account manager, scheduler, credentialing/compliance specialists, payroll/billing specialists, facility manager, client approver, healthcare worker, support engineer, integration operator, migration operator, and AI workflow operator.

A use case is not complete until traceability is complete.

---

# 19. UI QUALITY

Every major workflow must have a usable UI with typed clients, loading/empty/error/validation/permission states, responsive behavior, keyboard support, accessible labels/messages, and no browser-console errors.

Required UI tests:

```text
Component tests
Form validation tests
API integration tests
Accessibility tests
Playwright E2E tests
Visual smoke tests
Permission-state tests
```

Full E2E uses real local services and real PostgreSQL. Do not mock business APIs for full-system workflows.

---

# 20. REMAINING GOLDEN PATH ROADMAP

Complete phases in order. Do not begin a later phase until the current one meets acceptance criteria, passes its gate, is documented, committed, and leaves a clean tree.

## GP-03.3 — Complete authentication infrastructure

Finish refresh lineage, family compromise, real RS256 guard, user and membership version enforcement, live session-state enforcement, startup safety, local auth verification, coverage, and documentation.

Final commit:

```text
feat(gp-03): complete token session and signing infrastructure
```

Stop before GP-03.4 after GP-03.3 closes.

## GP-03.4 — Provider-neutral OIDC exchange

Implement Authorization Code + PKCE, state, nonce, issuer/audience/JWKS validation, exact issuer+subject identity mapping, and no auto-link by email. Initial adapters may include Entra ID, Auth0, Cognito, or Okta when approved.

## GP-03.5 — Invitations

Hashed single-use invitation tokens, expiration, replay rejection, revocation, resend, existing/new user acceptance, membership activation, audit, and outbox.

## GP-03.6 — Identity administration UI

Users, external identities, memberships, roles, permissions, sessions, invitations, lifecycle, and audit history.

## GP-03.7 — Replace remaining demo authentication

Remove uncontrolled demo paths platform-wide. Keep only explicit local adapters. Production rejects demo mode.

Final identity tag after all GP-03 slices pass:

```text
gp-03-identity-complete
```

## GP-04 — Workforce and facility core

Workers, profiles, contacts, specialties, skills, licenses, certifications, preferences, availability, facility hierarchy, departments, units, and worker lifecycle:

```text
PROSPECT
APPLICANT
ONBOARDING
ACTIVE
INACTIVE
SUSPENDED
ARCHIVED
```

## GP-05 — Credentialing and compliance

Credential types/requirements/documents, verification, expiration, renewal, packages, facility/assignment rules, deterministic eligibility, exceptions, and reviews. AI may assist but cannot independently approve mandatory compliance.

## GP-06 — ATS and requisitions

Requisitions, jobs, positions, requirements, rates, recruiter assignment, candidate submissions, interviews, offers, placements, rejection reasons, and pipelines. Support travel, per diem, local, long-term, and float pool.

## GP-07 — Scheduling and shifts

Shifts, templates, recurrence, assignments, offers, claims, cancellations, call-offs, replacements, calendars, availability conflicts, and geoverification. Include day/week/month views, double-booking, credential checks, availability, and rest rules.

## GP-08 — Matching

Deterministic eligibility first using specialty, skills, licenses, compliance, geography, availability, conflicts, compensation, preferences, experience, status, and contract type. AI ranking is explainable and cannot bypass compliance or authorization.

## GP-09 — Timekeeping

Time entries, timecards, clock events, breaks, adjustments, approvals, rejections, disputes, geo evidence, attestations, and documents. Support regular, overtime, double time, break, orientation, on-call, callback, holiday, and weekend rules.

## GP-10 — Pay and bill preview

Rate cards, pay/bill rates, differentials, overtime, holiday, stipends, bonuses, expenses, calculations, invoice previews, exports, and version history. Use decimal-safe money; never binary floating point.

## GP-11 — Notifications and workflow

Notifications, templates, delivery attempts, preferences, escalations, workflow definitions/instances/steps/tasks/timers/failures. Support in-app, email, SMS adapter, push adapter, and approved collaboration adapters.

## GP-12 — Integrations and migration

Boundaries for Bullhorn, Symplr, LaborEdge, Maestra, payroll, clients, HL7 where approved, documents, and credential providers. Include dry-run, idempotency, checkpointing, reconciliation, quarantine, dual run, rollback planning, audit, and no silent loss.

## GP-13 — AI, agents, search, and knowledge

Provider-neutral, Bedrock/OpenAI/Anthropic-compatible governed agents. Human approval for material actions. No security bypass, autonomous compliance approval, or autonomous payroll release. Record prompt/model versions, enforce tenant isolation, tool allowlists, cost limits, evaluation, and audit.

## GP-14 — Analytics and reporting

Recruiting funnel, fill rate, time to fill, credential expiration, compliance backlog, shift fulfillment, time approvals, pay/bill previews, recruiter/worker performance, integration health, and AI usage/cost. Do not overload transactional stores.

## GP-15 — AWS deployment readiness

IaC for development, staging, and production with separate state, GitHub OIDC, least privilege, encryption, Secrets Manager, KMS, backups/PITR, rollback, health verification, observability, alarms, SLOs, runbooks, incident response, DR, tagging, and budgets.

Do not claim real AWS deployment without actual credentials and target accounts. When unavailable, validate IaC, scan it, generate safe plans where possible, and document prerequisites/commands without fabricating evidence.

---

# 21. UNIVERSAL DEFINITION OF DONE

A phase is complete only when all applicable requirements pass.

## Product

- Primary, alternate, and failure workflows work.
- Permissions and tenant isolation are correct.
- Audit and events are correct.
- UI workflow is usable and accessible.

## Backend

- Domain and explicit state machines implemented.
- Handlers and real PostgreSQL persistence implemented.
- Empty DB and upgrade migrations pass.
- RLS, optimistic concurrency, idempotency, audit/outbox atomicity pass.
- OpenAPI matches implementation.
- Health/readiness pass.

## Frontend

- Typed API client
- No duplicated backend rules
- Validation/loading/error/empty/permission states
- Responsive and accessible behavior
- Playwright workflow

## Testing

- Unit
- HTTP contract
- PostgreSQL integration
- RLS
- Migration
- Security
- OpenAPI
- Docker
- Browser E2E
- Regression
- Coverage

## Operations

- Local deployment and seed data work.
- Health/readiness work.
- Correlation IDs and structured logs work.
- Secrets are externalized.
- Graceful shutdown works.
- Containers run non-root.
- Production configuration is documented.

---

# 22. BASELINE FULL GATE

At the end of every major phase run all applicable checks:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm coverage

pnpm --filter @carecareer/testing test:integration
pnpm --filter @carecareer/platform-service test:integration
pnpm --filter @carecareer/identity-service test:integration

pnpm --filter @carecareer/identity-service openapi:validate

pnpm build

pnpm --filter @carecareer/platform-service docker:verify
pnpm --filter @carecareer/identity-service docker:verify

pnpm demo:verify
pnpm local:verify
```

Add integration and Docker checks as services are introduced.

Run security-critical suites repeatedly to prove determinism. A later passing retry does not erase an unexplained earlier failure.

---

# 23. IMMEDIATE EXECUTION ORDER

Begin from the actual repository state after `15fc298`.

Execute in this order:

```text
1. Verify repository state and commits.
2. Read GP-03 architecture, threat, acceptance, test, and execution documents.
3. Correct documents that wrongly claim replay is complete.
4. Add a forward migration for durable refresh-token lineage.
5. Implement lineage repository operations.
6. Implement atomic token rotation.
7. Implement historical replay-family compromise.
8. Add historical replay tests.
9. Strengthen genuine concurrent refresh tests.
10. Prove five-session concurrency.
11. Implement the real RS256 production token guard.
12. Isolate DemoTokenValidator.
13. Complete user authorization-version enforcement.
14. Complete membership authorization-version enforcement.
15. Complete live session-state enforcement.
16. Add production startup safety tests.
17. Complete full local authentication verification.
18. Run exact coverage.
19. Run the complete GP-03.3 gate.
20. Update documentation and traceability.
21. Create the final GP-03.3 commit.
22. Confirm a clean tree.
23. Stop before GP-03.4 and report only observed evidence.
```

Do not begin GP-03.4 until GP-03.3 is fully complete, committed, and clean.

---

# 24. GP-03.3 FINAL COMMIT AND REPORT

After every GP-03.3 requirement passes, create:

```text
feat(gp-03): complete token session and signing infrastructure
```

Do not create the final GP-03 tag yet.

Confirm:

```bash
git status
```

shows a clean tree.

Report only verified evidence:

```text
Repository branch:
Starting commit:
GP-03.3 final commit:
Working tree:

Refresh-token lineage migration:
Refresh-token lineage table:
Raw refresh-token storage:
Historical replay result:
Concurrent refresh result:
Family-compromise result:
Successor-token result after compromise:
Five-session concurrency result:

Real RS256 production guard:
Demo adapter isolation:
Issuer validation:
Audience validation:
Algorithm-confusion rejection:
Unknown-key rejection:
Session-state enforcement:
User authorization-version enforcement:
Membership authorization-version enforcement:

Production startup safety:
Local authentication flow:
JWKS verification:
Private-key storage:
Access-token lifetime:
Session absolute lifetime:

Unit tests:
Security unit tests:
HTTP contract tests:
PostgreSQL integration tests:
Historical replay tests:
Concurrent refresh tests:
Startup safety tests:
OpenAPI validation:
Coverage:
Identity Docker verification:
Platform Docker regression:
DEMO-01 regression:
Local full-stack verification:

Known gaps:
GP-03.4 readiness recommendation:
```

Never omit a failed or unverified requirement. Use `Not implemented`, `Not tested`, `Not verified`, or `Blocked` when that is the truth.

Begin now by verifying commit `15fc298`, reviewing the migration chain, and implementing the forward migration for durable refresh-token lineage.
