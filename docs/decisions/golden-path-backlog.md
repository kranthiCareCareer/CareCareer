# CareCareer — Golden Path Implementation Backlog

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## Ordering Principles

1. Each slice is independently deployable and testable.
2. Later slices depend on earlier slices — no circular dependencies.
3. Scope is fixed per slice; expansion creates a new slice.
4. Acceptance criteria are testable without human judgment.
5. Slices produce business outcomes, not just technical artifacts.

---

## GP-00: Repository and Engineering Baseline

### Business outcome

Engineering team can create, test, build, and deploy code with confidence
that quality gates prevent regression.

### Included capabilities

- Turborepo and pnpm workspace configuration
- TypeScript strict configuration (tsconfig.base.json)
- ESLint strict rules (no-any, no-console, import-order)
- Prettier formatting
- Conventional commit enforcement (commitlint)
- CODEOWNERS file
- Changeset/versioning approach
- CI pipeline (GitHub Actions): lint, type-check, unit test, security scan, build, container
- Dependency and license scanning
- Secret scanning (gitleaks)
- Container vulnerability scanning (Trivy)
- Branch protection rules
- PR template

### Explicitly excluded

- Application code (services, packages beyond config)
- Deployment to AWS
- Database setup beyond Docker Compose

### Services and packages affected

- Root workspace configuration
- `.github/workflows/` CI pipeline
- `infrastructure/docker/` base images

### API contracts

N/A

### Events produced and consumed

N/A

### State transitions

N/A

### Database changes

N/A

### Security controls

- DP-005 (no secrets in source)
- Container vulnerability scanning

### Legacy dependencies

- Extends existing Maestra CI patterns (GitHub Actions, Docker, ECR)

### Acceptance criteria

- [ ] `pnpm lint` passes with zero warnings on empty workspace
- [ ] `pnpm type-check` passes
- [ ] `pnpm test` executes (even if no tests yet)
- [ ] `pnpm build` produces container artifacts
- [ ] PR requires approval + passing checks before merge
- [ ] Secret scan detects planted test secret and fails
- [ ] Container scan runs and reports known vulnerabilities
- [ ] Build artifacts tagged with commit SHA

### Automated tests

- CI pipeline self-test (lint, type-check, build on PR)
- Secret scan regression test
- Container scan executes without error

### Operational evidence

- CI pipeline green on main branch
- Protected branch rules active

### Reconciliation requirements

N/A

### Dependencies

- GitHub repository access
- Docker Hub / ECR access for base images

### Estimated effort

2-3 days

### Exit gate

PR runs lint, type-check, unit tests, security scans, build, and container validation.
Protected branch requires approval and successful checks.
Build artifacts are immutable and traceable to commit SHA.

---

## GP-01: NestJS Service Template

### Business outcome

Any engineer can generate a new production-grade service that meets all
platform standards without custom platform work.

### Included capabilities

- NestJS application scaffold
- Configuration validation (Zod)
- Tenant context extraction from JWT
- OIDC/JWT validation middleware
- Authorization guard (RBAC + ABAC)
- Prisma client with transaction wrapper
- RLS context (`SET LOCAL app.tenant_id`)
- Transactional outbox (same-transaction event write)
- Structured JSON logging (pino, no console.log)
- OpenTelemetry instrumentation (traces, metrics)
- Standard error handling (error envelope, no internals exposed)
- Idempotency middleware
- Health (`/health`), readiness (`/health/ready`), metrics (`/metrics`)
- OpenAPI generation from decorators
- Vitest unit test configuration
- Testcontainers integration test setup (PostgreSQL)
- Multi-stage Dockerfile
- GitHub Actions workflow template for the service

### Explicitly excluded

- Business domain logic
- Specific API endpoints
- Helm chart (deferred to GP-15)
- Terraform (deferred to GP-15)

### Services and packages affected

- `packages/service-template/` or generator script
- `packages/tenant-context/`
- `packages/auth/`
- `packages/database/`
- `packages/events/`
- `packages/observability/`
- `packages/errors/`

### API contracts

- Standard health/readiness/metrics endpoints
- Standard error envelope (golden-path-errors.md)
- Standard request/response headers

### Events produced and consumed

- Sample outbox event demonstrates pattern

### State transitions

N/A (template only)

### Database changes

- `idempotency_keys` table schema
- `event_outbox` table schema
- `event_inbox` table schema
- RLS policy template
- Application role creation

### Security controls

- TI-001 through TI-010 (tenant isolation)
- AU-001, AU-002, AU-005 (authentication)
- AZ-001, AZ-002 (authorization)
- IV-001, IV-002 (input validation)
- AD-001, AD-004 (audit basics)
- DP-004 (no sensitive data in logs)

### Legacy dependencies

None (template is greenfield)

### Acceptance criteria

- [ ] Generated service passes all CI checks
- [ ] Tenant isolation negative tests pass (Tenant A ≠ Tenant B)
- [ ] Outbox event created atomically with domain change (transaction test)
- [ ] Trace ID flows HTTP → database → event (correlation test)
- [ ] Invalid JWT returns 401
- [ ] Missing permission returns 403
- [ ] Invalid input returns 400 with standard error envelope
- [ ] Idempotent request returns original response
- [ ] Health endpoint responds while service is healthy
- [ ] Readiness fails when database is unavailable
- [ ] No provider-specific or Kubernetes-specific imports in domain layer

### Automated tests

- Unit: auth middleware, permission guard, idempotency, error handler
- Integration: RLS isolation, outbox atomicity, health/readiness
- Template validation: generated service compiles and passes checks

### Operational evidence

- Structured logs contain correlationId, tenantId, service name
- OpenTelemetry traces visible in local collector
- Metrics endpoint exposes RED metrics

### Reconciliation requirements

N/A

### Dependencies

- GP-00 (CI pipeline)
- Docker Compose running (PostgreSQL, Redis)

### Estimated effort

3-4 days

### Exit gate

A generated sample service passes all CI checks.
Tenant isolation negative tests pass.
Outbox event is created atomically with a domain change.
Trace and correlation IDs flow through HTTP, database, and event boundaries.
No provider-specific, Kubernetes-specific, or vendor-specific code in domain layer.

---

## GP-02: Platform Service

### Business outcome

Tenants can be provisioned and configured; entitlements control module access.

### Included capabilities

- Tenant CRUD (create, read, update status)
- Tenant lifecycle (PROVISIONING → ACTIVE → SUSPENDED → DEACTIVATED)
- Organization and legal entity
- Branch hierarchy (tenant-scoped)
- Entitlements (which modules enabled per tenant)
- Feature configuration (tenant-level key-value)
- Audit events for all privileged changes

### Explicitly excluded

- Billing/metering
- Self-service tenant signup
- Notification templates

### Services and packages affected

- `services/platform-service/`
- `packages/database/` (tenant schema)

### API contracts

- `GET /v1/tenants/{tenantId}`
- `POST /v1/tenants` (platform admin only)
- `PATCH /v1/tenants/{tenantId}` (status, config)
- `GET /v1/branches`
- `POST /v1/branches`

### Events produced and consumed

- `carecareer.tenant.provisioned.v1`
- `carecareer.tenant.suspended.v1`
- `carecareer.tenant.activated.v1`
- `carecareer.entitlement.changed.v1`

### State transitions

- Tenant: PROVISIONING → ACTIVE → SUSPENDED → DEACTIVATED

### Database changes

- `tenants` table with RLS
- `organizations` table
- `legal_entities` table
- `branches` table
- `entitlements` table
- `feature_config` table
- `audit_entries` table (append-only)

### Security controls

- TI-001 through TI-006 (tenant isolation)
- AZ-001 (permission check on mutations)
- AD-001, AD-002 (audit)

### Legacy dependencies

None (new canonical model)

### Acceptance criteria

- [ ] Admin can provision a tenant (PROVISIONING → ACTIVE)
- [ ] Tenant can be suspended and deactivated
- [ ] Branch hierarchy is tenant-scoped (RLS test)
- [ ] Entitlement check is fail-closed (disabled module returns 403)
- [ ] Cross-tenant read returns 404 (not 403)
- [ ] Cross-tenant write returns 404
- [ ] Every configuration change produces audit record
- [ ] Suspended tenant's users cannot access resources

### Automated tests

- Unit: tenant lifecycle state machine, entitlement evaluation
- Integration: RLS isolation, cross-tenant negative tests, audit creation

### Operational evidence

- Tenant provisioning logged with correlation ID
- Entitlement change events published to outbox

### Reconciliation requirements

N/A (new model — no legacy equivalent at this layer)

### Dependencies

- GP-01 (service template)

### Estimated effort

3-4 days

### Exit gate

Admin can provision tenant, manage branches, configure entitlements.
Cross-tenant tests fail correctly. Every privileged change is audited.

---

## GP-03: Identity and Authorization

### Business outcome

Users can authenticate via OIDC, map to CareCareer identity, and receive
permission-scoped access within their tenant.

### Included capabilities

- External identity mapping (OIDC subject → CareCareer user)
- User profile (name, email, status)
- Tenant membership (user belongs to tenant)
- Invitation lifecycle (invite → accept → active)
- Roles (CRUD, assignment to users)
- Permissions (resolved from roles)
- Policy attribute evaluation (ABAC conditions)
- Authorization decision endpoint
- Access suspension (immediate block)
- Break-glass controls (elevation with audit)
- Authorization audit events

### Explicitly excluded

- Password storage, token issuance, MFA, account recovery (IdP responsibility)
- SSO federation configuration

### Services and packages affected

- `services/identity-service/`
- `packages/auth/` (guards, decorators, JWT validation)

### API contracts

- `GET /v1/me`
- `GET /v1/me/permissions`
- `POST /v1/users/invite`
- `PATCH /v1/users/{userId}`
- `POST /v1/users/{userId}/roles`
- `DELETE /v1/users/{userId}/roles/{roleId}`

### Events produced and consumed

- `carecareer.user.created.v1`
- `carecareer.user.invited.v1`
- `carecareer.role.assigned.v1`
- `carecareer.access.revoked.v1`
- `carecareer.access.elevated.v1` (break-glass)

### State transitions

- User: INVITED → ACTIVE → SUSPENDED → DEACTIVATED
- Invitation: PENDING → ACCEPTED → EXPIRED

### Database changes

- `users` table
- `tenant_memberships` table
- `roles` table
- `permissions` table
- `role_permissions` table
- `user_roles` table
- `invitations` table

### Security controls

- AU-001 through AU-005 (authentication)
- AZ-001 through AZ-006 (authorization)
- AD-003, AD-006 (audit for denied actions)

### Legacy dependencies

- Auth0 (OIDC provider for token validation)
- Maestra identity mapping (external_references seed)

### Acceptance criteria

- [ ] OIDC-authenticated user maps to canonical CareCareer user
- [ ] User belongs to tenant with specific roles
- [ ] Tenant switching requires valid membership
- [ ] Explicit deny overrides role grants
- [ ] Disabled membership immediately blocks access (next request fails)
- [ ] Authorization decisions generate audit evidence
- [ ] Break-glass elevation is logged with reason and TTL
- [ ] Invitation expires after configured TTL

### Automated tests

- Unit: permission resolution, ABAC evaluation, role hierarchy
- Integration: full auth flow with Keycloak, cross-tenant denial, break-glass audit

### Operational evidence

- Authorization decisions logged with policy version
- Failed auth attempts visible in structured logs

### Reconciliation requirements

- Auth0 user subjects mapped to CareCareer users (verified by count)

### Dependencies

- GP-01 (service template)
- GP-02 (tenant must exist)
- Keycloak Docker container for local OIDC

### Estimated effort

4-5 days

### Exit gate

User authenticates, maps to CareCareer identity, receives tenant-scoped permissions.
Denied actions produce audit. Break-glass is logged. Disabled user is immediately blocked.

---

## GP-04: Admin Portal Shell

### Business outcome

Authorized administrator can manage tenants and users through a web interface.

### Included capabilities

- OIDC login flow (redirect to IdP)
- Tenant selector (for multi-tenant admin)
- Permission-aware navigation (hide unauthorized sections)
- Tenant management page (list, create, suspend)
- User invitation page
- Role assignment page
- Audit log viewer (read-only)
- Error and loading state patterns
- Design system foundation (shadcn/ui + Tailwind)

### Explicitly excluded

- Worker/shift/timecard management (later slices)
- Mobile responsive (desktop-first for admin)
- Dark mode

### Services and packages affected

- `apps/admin-portal/` (Next.js 14)
- `packages/ui/` (shared design system)

### API contracts

- Consumes: platform-service and identity-service APIs

### Events produced and consumed

N/A (UI only)

### State transitions

N/A

### Database changes

N/A

### Security controls

- AU-001 (JWT validation)
- AZ-001 (permission-aware routing)
- DP-004 (no sensitive data in browser console/logs)

### Legacy dependencies

None

### Acceptance criteria

- [ ] Admin can log in via OIDC
- [ ] Admin sees only authorized navigation items
- [ ] Admin can create a tenant and see it in the list
- [ ] Admin can invite a user and assign a role
- [ ] Admin can view audit log entries
- [ ] Unauthorized routes redirect to login or show 403 page
- [ ] Loading, error, and empty states are handled

### Automated tests

- E2E: login flow, tenant creation, user invitation (Playwright)
- Component: permission-aware navigation rendering

### Operational evidence

- Browser errors logged to observability (Sentry or equivalent)

### Reconciliation requirements

N/A

### Dependencies

- GP-02 (platform-service running)
- GP-03 (identity-service running)
- Keycloak or Auth0 dev tenant

### Estimated effort

3-4 days

### Exit gate

Authorized administrator can create a tenant, invite a user, assign a role,
and access a tenant-scoped dashboard. Platform-spine milestone complete.

---

## GP-05: Facility and Department Management

### Business outcome

Client facilities can be configured with departments, timezones, geofences,
and credential requirements.

### Included capabilities

- Client entity (basic: name, status)
- Facility CRUD (name, address, timezone, coordinates, geofence)
- Department/unit within facility
- Credential requirement matrix (per facility, department, role)
- Approval policy configuration (who confirms assignments)
- Confirmation-authority configuration (scheduler/client/auto-policy)
- Facility events

### Explicitly excluded

- Client sales pipeline (H3)
- Billing configuration (GP-13)
- Multi-facility bulk operations

### Services and packages affected

- `services/staffing-service/` (client module)

### API contracts

- `POST /v1/facilities`
- `GET /v1/facilities`
- `GET /v1/facilities/{facilityId}`
- `POST /v1/facilities/{facilityId}/departments`
- `GET /v1/facilities/{facilityId}/credential-requirements`

### Events produced and consumed

- Produces: `carecareer.facility.created.v1`, `carecareer.facility.updated.v1`
- Consumes: none

### State transitions

- Facility: ACTIVE, INACTIVE, SUSPENDED

### Database changes

- `clients` table
- `facilities` table (with geofence, timezone, coordinates)
- `departments` table
- `credential_requirements` table (facility × department × role × credential_type)
- `confirmation_policies` table

### Security controls

- TI-001 through TI-006
- AZ-001 (facilities:create, facilities:update)

### Legacy dependencies

- Symplr facility data (seed source for pilot facilities)

### Acceptance criteria

- [ ] Facility timezone is mandatory (reject if missing)
- [ ] Geofence config is stored with version (changes audited)
- [ ] Requirement changes affect future evaluations only
- [ ] Client users see only their authorized facilities
- [ ] Facility creation emits versioned event
- [ ] Credential requirements queryable by role + department

### Automated tests

- Unit: requirement matrix query, geofence validation
- Integration: RLS (client A cannot see client B's facilities)

### Operational evidence

- Facility creation logged with full config

### Reconciliation requirements

- Facility count and config compared against Symplr replicated DB (Wave 1)

### Dependencies

- GP-01 (service template)
- GP-02 (tenant context)
- GP-03 (authorization for client users)

### Estimated effort

3 days

### Exit gate

Facilities configured with timezone, geofence, departments, and credential
requirements. Requirement matrix queryable. Events emitted.

---

## GP-06: Worker Minimum Profile

### Business outcome

Workers exist in the system with profiles sufficient for eligibility evaluation and shift assignment.

### Included capabilities

- Worker registration (firstName, lastName, email, phone, roles)
- Worker status lifecycle
- Profession and specialty
- Home location (for distance calculation)
- Availability (basic: available dates/times)
- Tenant and branch relationship
- External references (Symplr, Bullhorn, Auth0 subject mapping)
- Worker self-service update (profile fields)

### Explicitly excluded

- Full onboarding workflow
- Resume/document upload (handled by credential slice)
- Recruiting pipeline
- Engagement scoring

### Services and packages affected

- `services/workforce-service/` (worker module)

### API contracts

- `POST /v1/workers`
- `GET /v1/workers/{workerId}`
- `PATCH /v1/workers/{workerId}`

### Events produced and consumed

- Produces: `carecareer.worker.created.v1`, `carecareer.worker.updated.v1`
- Consumes: `carecareer.credential.expired.v1` (status → BLOCKED)

### State transitions

- Worker: APPLICANT → SCREENING → QUALIFIED → CREDENTIALING → READY → ACTIVE → INACTIVE → BLOCKED → ALUMNI

### Database changes

- `workers` table
- `worker_availability` table
- `external_references` table entries

### Security controls

- TI-001 through TI-006
- AZ-005 (worker can only access own data)
- DP-004, DP-007 (PII handling)

### Legacy dependencies

- Symplr replicated DB (seed pilot workers)
- Auth0 (subject mapping)

### Acceptance criteria

- [ ] Worker created with mandatory fields
- [ ] Worker can update own profile (version check)
- [ ] Worker A cannot read Worker B's profile
- [ ] External references stored correctly (Symplr ID mapped)
- [ ] Status transitions are validated (invalid transition → error)
- [ ] PII fields never appear in logs

### Automated tests

- Unit: status state machine, profile validation
- Integration: RLS isolation, external reference lookup

### Operational evidence

- Worker creation events in outbox

### Reconciliation requirements

- Pilot worker count matches Symplr seed count
- Field comparison (name, status, roles) at >99%

### Dependencies

- GP-01, GP-02, GP-03

### Estimated effort

2-3 days

### Exit gate

Workers exist with profiles. Status lifecycle enforced. External references mapped.
Self-service update works. PII protected.

---

## GP-07: Credential and Eligibility Engine

### Business outcome

System can deterministically decide whether a worker is eligible to work at a
specific facility, and block ineligible workers from assignment and clock-in.

### Included capabilities

- Credential types (RN_LICENSE, BLS, CNA_CERT, etc.)
- Credential record CRUD
- Verification lifecycle (UPLOADED → VERIFIED → EXPIRED)
- Expiration monitoring (daily job)
- Facility requirement matrix evaluation
- Eligibility evaluation at 4 checkpoints
- Machine-readable reason codes
- Exception handling (ELIGIBLE_WITH_EXCEPTION)
- Eligibility snapshot (historical record of every evaluation)
- Worker blocking on credential expiry

### Explicitly excluded

- OCR document extraction (AI — later)
- State board API integration (later)
- Automated primary source verification (later)

### Services and packages affected

- `services/workforce-service/` (credential module)

### API contracts

- `POST /v1/workers/{workerId}/credentials`
- `GET /v1/workers/{workerId}/credentials`
- `POST /v1/workers/{workerId}/eligibility-evaluations`
- `GET /v1/workers/{workerId}/eligibility-evaluations/{evaluationId}`

### Events produced and consumed

- Produces: `carecareer.credential.added.v1`, `carecareer.credential.verified.v1`,
  `carecareer.credential.expired.v1`, `carecareer.eligibility.evaluated.v1`,
  `carecareer.worker.blocked.v1`, `carecareer.worker.unblocked.v1`
- Consumes: `carecareer.facility.created.v1` (requirement matrix reference)

### State transitions

- Credential: UPLOADED → EXTRACTED → PENDING_VERIFICATION → VERIFIED → EXPIRING → EXPIRED
- Eligibility: PENDING → ELIGIBLE | INELIGIBLE | ELIGIBLE_WITH_EXCEPTION | ERROR

### Database changes

- `credential_types` table
- `worker_credentials` table
- `eligibility_evaluations` table (historical, append-only)

### Security controls

- CC-001 through CC-005 (credential/compliance controls)
- AD-001 (every evaluation audited)

### Legacy dependencies

- Symplr credential data (seed)
- Symplr requirement matrix (seed)

### Acceptance criteria

- [ ] Eligibility is deterministic (same inputs → same output, always)
- [ ] Ineligible decisions include machine-readable reasons
- [ ] MARKETPLACE_DISPLAY, REQUEST_SUBMISSION, ASSIGNMENT_CONFIRMATION, CLOCK_IN checkpoints work
- [ ] Expired credential → worker BLOCKED → affected assignments cancelled
- [ ] Historical evaluations preserved (never mutated)
- [ ] Daily expiration job catches all expiring credentials
- [ ] OIG/SAM exclusion reason available (stub for now)

### Automated tests

- Unit: eligibility evaluation logic (decision table), credential state machine
- Integration: full evaluation flow, expiration job, blocking cascade

### Operational evidence

- Eligibility evaluation count per day
- Credential expiration alerts firing

### Reconciliation requirements

- Symplr shadow comparison: same worker+facility → same eligible/ineligible result
- 100% match required for blocking decisions

### Dependencies

- GP-05 (facility requirements exist)
- GP-06 (workers exist)

### Estimated effort

4-5 days

### Exit gate

Eligibility is deterministic. Same inputs produce same outcome.
Ineligible decisions list reasons. Results preserved historically.
All four checkpoints work. Shadow comparison operational.

---

## GP-08: Shift Creation and Publication

### Business outcome

Schedulers and hiring managers can create shifts with multi-worker requirements
and publish them to the marketplace.

### Included capabilities

- Shift CRUD (create in DRAFT, update before publish)
- Multi-worker requirement (requiredWorkerCount ≥ 1)
- Pay/bill rate input
- Facility/department association
- Credential requirements auto-attached from facility config
- Publish to marketplace
- Cancel (from any pre-completion state)
- Partial fill tracking
- Overnight shift support (UTC times, businessDate)
- Optimistic concurrency (version field)
- Idempotent creation and publication
- Audit and events

### Explicitly excluded

- Batch shift creation
- Recurring shift templates
- AI rate suggestions
- Demand forecasting

### Services and packages affected

- `services/staffing-service/` (schedule module)

### API contracts

- `POST /v1/shifts`
- `GET /v1/shifts/{shiftId}`
- `PATCH /v1/shifts/{shiftId}`
- `POST /v1/shifts/{shiftId}/publish`
- `POST /v1/shifts/{shiftId}/cancel`

### Events produced and consumed

- Produces: `carecareer.shift.created.v1`, `carecareer.shift.published.v1`,
  `carecareer.shift.updated.v1`, `carecareer.shift.cancelled.v1`
- Consumes: `carecareer.credential.expired.v1` (cancel affected assignments on shift)

### State transitions

- Shift: DRAFT → PUBLISHED → PARTIALLY_FILLED → FILLED → IN_PROGRESS → COMPLETED → CLOSED
- Terminal: CANCELLED (from DRAFT, PUBLISHED, PARTIALLY_FILLED, FILLED)

### Database changes

- `shifts` table
- `shift_credential_requirements` table

### Security controls

- TI-001 through TI-006
- AZ-001 (shifts:create, shifts:publish, shifts:cancel)

### Legacy dependencies

None (new shifts created in CareCareer for pilot)

### Acceptance criteria

- [ ] Valid shift moves DRAFT → PUBLISHED
- [ ] Invalid transitions return INVALID_STATE_TRANSITION error
- [ ] requiredWorkerCount > 1 supported
- [ ] Shift in past cannot be published
- [ ] Optimistic concurrency prevents lost updates
- [ ] Repeated create with same idempotency key returns original
- [ ] Published shift visible to marketplace queries (GP-09)
- [ ] Cancelled shift emits event with affected assignments

### Automated tests

- Unit: shift state machine (every allowed + denied transition)
- Integration: concurrent update conflict, idempotency, event emission

### Operational evidence

- Shift creation rate metric
- State transition events in outbox

### Reconciliation requirements

- Shift count comparison against Symplr (shadow shifts)

### Dependencies

- GP-05 (facility and department exist)
- GP-07 (credential requirements attached from facility)

### Estimated effort

3 days

### Exit gate

Shifts created, published, cancelled with full state machine.
Multi-worker support. Idempotent. Events emitted. Concurrency safe.

---

## GP-09: Worker Marketplace and Shift Request

### Business outcome

Eligible workers can discover available shifts and submit requests.

### Included capabilities

- Marketplace query (published, available shifts)
- Pre-filtered by worker eligibility
- Filter by role, facility, date range, distance
- Basic sort (date, distance)
- Shift detail view
- Request submission (triggers eligibility evaluation)
- Duplicate request prevention
- Withdrawal
- Request expiration (configurable TTL)

### Explicitly excluded

- AI-powered ranking/recommendations
- Push notification on new shift (notification slice later)
- Mobile-specific endpoints

### Services and packages affected

- `services/staffing-service/` (schedule module, marketplace query)

### API contracts

- `GET /v1/marketplace/shifts`
- `POST /v1/shifts/{shiftId}/requests`

### Events produced and consumed

- Produces: `carecareer.shift-request.created.v1`
- Consumes: `carecareer.shift.published.v1` (index for marketplace)

### State transitions

- ShiftRequest: REQUESTED → UNDER_REVIEW → CONFIRMED | REJECTED | WITHDRAWN | EXPIRED

### Database changes

- `shift_requests` table

### Security controls

- AZ-001 (shift-requests:create — WORKER role only)
- AZ-005 (worker submits only for self)
- CC-001 (eligibility blocks ineligible request)

### Legacy dependencies

None

### Acceptance criteria

- [ ] Worker sees only published, available, eligible shifts
- [ ] Worker cannot see other tenants' shifts
- [ ] Worker cannot request overlapping assignment
- [ ] Duplicate request returns original result (idempotent)
- [ ] Ineligible worker gets 422 with reasons
- [ ] Eligibility rechecked at request submission time
- [ ] Withdrawn request cannot be re-confirmed

### Automated tests

- Unit: marketplace filtering logic, duplicate detection
- Integration: eligibility gate, cross-tenant isolation

### Operational evidence

- Request submission rate metric
- Eligibility rejection rate metric

### Reconciliation requirements

N/A (new shifts in pilot)

### Dependencies

- GP-07 (eligibility engine)
- GP-08 (published shifts exist)

### Estimated effort

3 days

### Exit gate

Workers see eligible shifts. Requests blocked for ineligible workers.
Duplicates prevented. Expiration and withdrawal work.

---

## GP-10: Confirmation and Assignment

### Business outcome

Shift requests are confirmed, creating assignments. Workers are assigned to shifts.

### Included capabilities

- Scheduler confirmation
- Client confirmation
- Policy-based auto-confirmation interface (stub — configurable per facility)
- Assignment creation (atomic)
- Rejection with reason
- Cancellation (by worker, client, scheduler, system)
- No-show detection interface (time-based trigger)
- Shift fill-count update (PARTIALLY_FILLED → FILLED)
- Race condition prevention (cannot overfill)
- Eligibility re-check at confirmation
- Notification events (for downstream)

### Explicitly excluded

- Replacement finding workflow
- AI-optimized confirmation sequencing

### Services and packages affected

- `services/staffing-service/` (schedule module)

### API contracts

- `POST /v1/shift-requests/{requestId}/confirm`
- `POST /v1/shift-requests/{requestId}/reject`
- `GET /v1/assignments/{assignmentId}`
- `POST /v1/assignments/{assignmentId}/cancel`

### Events produced and consumed

- Produces: `carecareer.shift-request.confirmed.v1`, `carecareer.shift-request.rejected.v1`,
  `carecareer.assignment.created.v1`, `carecareer.assignment.cancelled.v1`
- Consumes: `carecareer.credential.expired.v1` (cancel assignment if credential expires)

### State transitions

- ShiftRequest: REQUESTED/UNDER_REVIEW → CONFIRMED | REJECTED
- Assignment: CONFIRMED → CHECKED_IN → ... → COMPLETED | CANCELLED | NO_SHOW
- Shift: PUBLISHED → PARTIALLY_FILLED → FILLED (on fill)

### Database changes

- `assignments` table

### Security controls

- AZ-001 (shift-requests:confirm — SCHEDULER/HIRING_MANAGER/SYSTEM)
- CC-001 (eligibility re-check before confirmation)

### Legacy dependencies

None

### Acceptance criteria

- [ ] Confirmation authority follows tenant/facility config
- [ ] Assignment created atomically with shift fill-count update
- [ ] Race condition: two confirmations for last slot → only one succeeds
- [ ] Eligibility re-checked at confirmation (blocks if expired)
- [ ] Cancellation reopens slot (FILLED → PARTIALLY_FILLED)
- [ ] Assignment events are durable (in outbox)
- [ ] No-show status can be set (15 min past shift start)

### Automated tests

- Unit: fill-count logic, race condition simulation
- Integration: concurrent confirmation, eligibility re-check, cancellation cascade

### Operational evidence

- Assignment creation rate
- Fill rate metric (shifts filled / shifts published)

### Reconciliation requirements

- Assignment count matches for pilot shifts

### Dependencies

- GP-09 (shift requests exist)
- GP-07 (eligibility re-check)

### Estimated effort

3-4 days

### Exit gate

Confirmation follows policy. Assignments atomic. Cannot overfill.
Eligibility re-checked. Events durable and replayable.

---

## GP-11: Clock-Event Capture

### Business outcome

Workers can clock in/out with geofence validation, break tracking, and offline support.

### Included capabilities

- Clock in, clock out, break start, break end
- Device-generated event ID (offline deduplication)
- Offline submission support (flag + server timestamp comparison)
- Geofence validation (distance to facility coordinates)
- Timestamp and timezone handling (UTC storage, facility tz for display)
- Clock sequence validation (no clock-out before clock-in)
- Eligibility check at clock-in (credential still valid?)
- Device drift detection (server timestamp vs device timestamp)
- Raw evidence retention (coordinates, device info, geofence result)
- Rejection with reason (geofence fail, credential expired, sequence error)

### Explicitly excluded

- Physical time clock integration
- Biometric validation
- Supervisor signature
- Kiosk mode

### Services and packages affected

- `services/time-finance-service/` (time module)

### API contracts

- `POST /v1/assignments/{assignmentId}/clock-events`
- `GET /v1/assignments/{assignmentId}/clock-events`

### Events produced and consumed

- Produces: `carecareer.clock-event.recorded.v1`, `carecareer.clock-event.rejected.v1`
- Consumes: `carecareer.assignment.created.v1` (prepare for clock events)

### State transitions

- Assignment: CONFIRMED → CHECKED_IN → ON_BREAK → WORKING → CHECKED_OUT

### Database changes

- `clock_events` table (with geofence evidence, device info)

### Security controls

- AZ-001 (clock-events:create — WORKER, assigned only)
- AZ-005 (worker can only clock own assignment)
- CC-002 (credential check at clock-in)
- TI-009 (events carry tenant context)
- DP-004 (location data classified CONFIDENTIAL)

### Legacy dependencies

- Maestra mobile clock behavior (preserve: GPS, breaks, offline)

### Acceptance criteria

- [ ] Duplicate deviceEventId deduplicated (returns original)
- [ ] Out-of-sequence rejected (CLOCK_OUT without CLOCK_IN)
- [ ] Geofence fail → rejection with distance and radius
- [ ] Credential expired at clock-in → rejection with CREDENTIAL_EXPIRED
- [ ] Offline submission accepted with offlineSubmitted=true flag
- [ ] Device drift detected (>5 min difference logged as warning)
- [ ] Overnight shift clock events handled correctly
- [ ] DST transition handled (UTC storage)
- [ ] Raw evidence (coordinates, geofence result) immutably stored
- [ ] Sensitive location data follows classification rules

### Automated tests

- Unit: sequence validation, geofence calculation, deduplication
- Integration: full clock flow, offline retry, overnight, DST

### Operational evidence

- Clock event rate metric
- Geofence rejection rate metric
- Offline submission rate metric

### Reconciliation requirements

- Clock event timestamps compared against Maestra clock data for same assignments

### Dependencies

- GP-10 (assignments exist)
- GP-07 (eligibility check at clock-in)
- GP-05 (facility geofence config)

### Estimated effort

4 days

### Exit gate

Clock events captured with geofence, offline support, deduplication.
Credential check at clock-in. Evidence retained. Overnight/DST tested.

---

## GP-12: Timecard Generation and Approval

### Business outcome

Worked time is calculated into timecards and approved through a defined workflow.

### Included capabilities

- Timecard generation from clock events (deterministic hour calculation)
- Break rule application (state-specific)
- Exception detection (early/late, missing punch, geofence warning, OT threshold)
- Worker review (optional step)
- Submission
- Client review
- Approval (single and bulk-compatible)
- Rejection with reason
- Correction (version increment, previous preserved)
- Re-submission after correction
- Signature/evidence references

### Explicitly excluded

- Complex approval chains (single approver for pilot)
- Automated exception resolution

### Services and packages affected

- `services/time-finance-service/` (timecard module)

### API contracts

- `POST /v1/assignments/{assignmentId}/timecard`
- `GET /v1/timecards/{timecardId}`
- `POST /v1/timecards/{timecardId}/submit`
- `POST /v1/timecards/{timecardId}/approve`
- `POST /v1/timecards/{timecardId}/reject`

### Events produced and consumed

- Produces: `carecareer.timecard.generated.v1`, `carecareer.timecard.submitted.v1`,
  `carecareer.timecard.approved.v1`, `carecareer.timecard.rejected.v1`
- Consumes: `carecareer.clock-event.recorded.v1` (input for generation)

### State transitions

- Timecard: DRAFT → GENERATED → WORKER_REVIEW → SUBMITTED → CLIENT_REVIEW → APPROVED → CALCULATED → EXPORT_READY
- Alternate: REJECTED → CORRECTED → SUBMITTED

### Database changes

- `timecards` table (with version, exceptions, hours)
- `timecard_versions` table (historical versions preserved)

### Security controls

- AZ-001 (timecards:approve — TIMECARD_APPROVER/PAYROLL_ADMIN)
- AZ-005 (worker sees only own timecards)
- FI-002 (approved timecards immutable without correction flow)
- AD-001 (approval is enhanced audit)

### Legacy dependencies

- Maestra timecard service (reconciliation source)
- Symplr timecard data (shadow comparison)

### Acceptance criteria

- [ ] Clock events → calculated hours (deterministic)
- [ ] Break rules applied per state config
- [ ] Exceptions detected and flagged with severity
- [ ] Rejection requires reason
- [ ] Correction creates new version (previous immutable)
- [ ] Client cannot approve unauthorized facility timecard
- [ ] Same approved timecard → same downstream calculation input
- [ ] Bulk approval works (repeated single calls)

### Automated tests

- Unit: hour calculation, break rules, exception detection, state machine
- Integration: full flow (generate → submit → approve), rejection → correction

### Operational evidence

- Timecard approval time metric
- Exception rate metric

### Reconciliation requirements

- Hours and exceptions compared against Symplr/Maestra timecards (100% match for hours)

### Dependencies

- GP-11 (clock events exist)
- GP-05 (facility timezone for business date)

### Estimated effort

4-5 days

### Exit gate

Timecards generated, exceptions detected, approval flow complete.
Corrections versioned. Immutability enforced. Reconciliation operational.

---

## GP-13: Pay and Bill Preview

### Business outcome

Approved timecards produce deterministic, explainable pay and bill calculations
that can be compared against Symplr and previewed in export format.

### Included capabilities

- Pay rule set (base, OT daily/weekly, night differential, weekend, holiday, guaranteed hours)
- Bill rule set (markup, flat fee, differential)
- Calculation engine (deterministic, line-item breakdown)
- Overtime handling (state-specific: daily vs weekly)
- Break deductions
- Holiday premium
- Calculation explanation (human-readable trace of rules applied)
- Versioned calculations (superseding on correction)
- Export preview (Paycom format, NetSuite format) — preview only, no posting
- Immutability of completed calculations

### Explicitly excluded

- Payroll disbursement, tax withholding, ACH, filing
- General-ledger posting
- Automatic Paycom/NetSuite production submission
- Mileage and travel stipends (H4)

### Services and packages affected

- `services/time-finance-service/` (payroll and billing modules)

### API contracts

- `POST /v1/timecards/{timecardId}/calculations`
- `GET /v1/calculations/{calculationId}`
- `GET /v1/calculations/{calculationId}/explanation`
- `POST /v1/calculations/{calculationId}/export-preview`

### Events produced and consumed

- Produces: `carecareer.calculation.completed.v1`, `carecareer.calculation.failed.v1`,
  `carecareer.export-preview.generated.v1`
- Consumes: `carecareer.timecard.approved.v1` (trigger calculation)

### State transitions

- Calculation: PENDING → CALCULATING → COMPLETED | FAILED
- COMPLETED → SUPERSEDED (on timecard correction)

### Database changes

- `pay_rules` table (versioned)
- `bill_rules` table (versioned)
- `calculations` table (with line items, explanation, version refs)
- `export_previews` table

### Security controls

- FI-001 through FI-005 (financial controls)
- AD-001 (every calculation audited)
- DP-004 (financial amounts classified CONFIDENTIAL/RESTRICTED)

### Legacy dependencies

- Symplr pay/bill configuration (seed pay/bill rules)
- Symplr calculation output (reconciliation source)
- Paycom export format specification
- NetSuite invoice format specification

### Acceptance criteria

- [ ] Calculation is deterministic (same inputs → same result, always)
- [ ] Explanation traces each rule applied with inputs and outputs
- [ ] Completed calculations are NEVER mutated
- [ ] Correction produces new calculation that supersedes previous
- [ ] OT calculated correctly for California (daily) and federal (weekly) rules
- [ ] Night differential applied for configured hours
- [ ] Weekend and holiday premiums applied correctly
- [ ] Total pay and bill match expected test fixtures exactly
- [ ] Export preview matches Paycom/NetSuite format requirements
- [ ] Financial comparison against Symplr at line-item level

### Automated tests

- Unit: decision table tests for ALL rule combinations (OT × differential × holiday)
- Integration: full flow (approved timecard → calculation → export preview)
- Regression: Symplr comparison test fixtures

### Operational evidence

- Calculation success/failure rate
- Processing time per calculation
- Rule coverage (which rules fired)

### Reconciliation requirements

- Per-line-item comparison against Symplr within $0.01
- Finance team review and sign-off before any pilot cutover

### Dependencies

- GP-12 (approved timecards)
- Pay/bill rule configuration (manual seed from Symplr)
- Paycom format documentation
- NetSuite format documentation

### Estimated effort

5-6 days

### Exit gate

Deterministic, explainable calculations. Immutable results.
Corrections produce new versions. Financial reconciliation against Symplr
supports line-level comparison. Finance team has reviewed output format.

---

## GP-14: Legacy Adapter and Shadow Mode

### Business outcome

CareCareer results can be compared against Symplr/Maestra without affecting
production workflows. Discrepancies are identified and categorized.

### Included capabilities

- Symplr replicated-database reader (credential, shift, timecard, pay data)
- Vendor-to-canonical schema translation
- External reference resolution (Symplr ID → CareCareer UUID)
- Snapshot import (initial seed for pilot data)
- Incremental sync (detect Symplr changes for comparison)
- Shadow comparison engine (eligibility, hours, pay/bill)
- Exception queue (mismatches categorized and tracked)
- Reconciliation dashboard/report (match rate, trends, exceptions)

### Explicitly excluded

- Writing to Symplr
- Writing to Bullhorn
- Full historical data migration
- Automated reconciliation resolution

### Services and packages affected

- `migration/connectors/symplr/`
- `migration/connectors/maestra/`
- `migration/reconciliation/`

### API contracts

- `POST /v1/reconciliation-runs`
- `GET /v1/reconciliation-runs/{runId}`
- `GET /v1/reconciliation-runs/{runId}/exceptions`

### Events produced and consumed

- Produces: `carecareer.legacy-record.imported.v1`, `carecareer.reconciliation.completed.v1`,
  `carecareer.reconciliation.exception-detected.v1`
- Consumes: various CareCareer events (for comparison)

### State transitions

N/A (read and compare only)

### Database changes

- `reconciliation_runs` table
- `reconciliation_exceptions` table

### Security controls

- ADR-008 (anti-corruption layer)
- TI-001 (tenant-scoped reconciliation)
- AD-001 (import and comparison audited)

### Legacy dependencies

- Symplr replicated database access (CRITICAL)
- Maestra PostgreSQL read access
- Symplr schema documentation

### Acceptance criteria

- [ ] No vendor DTO enters a domain service
- [ ] Import is repeatable and idempotent (re-run produces same result)
- [ ] Drift categorized (CareCareer bug, Symplr bug, data quality, rule interpretation)
- [ ] Legacy remains authoritative writer in shadow mode
- [ ] Eligibility comparison: 100% match for blocking decisions
- [ ] Financial comparison: within $0.01 per line item
- [ ] Exception dashboard shows match rate trending toward target

### Automated tests

- Unit: schema translation, ID resolution
- Integration: full import → comparison → exception report

### Operational evidence

- Import count metrics
- Reconciliation match rate dashboard
- Exception resolution time

### Reconciliation requirements

This IS the reconciliation implementation.

### Dependencies

- GP-07 (eligibility to compare)
- GP-12 (timecards to compare)
- GP-13 (calculations to compare)
- Symplr replicated DB access confirmed

### Estimated effort

5-6 days

### Exit gate

Shadow comparison operational. No vendor DTOs in domain. Drift categorized.
Reconciliation thresholds visible. Finance and eligibility comparisons running.

---

## GP-15: Shared AWS Development Environment

### Business outcome

Golden-path services deploy from CI to a shared non-production AWS environment.

### Included capabilities

- Container registry (ECR)
- Runtime environment (EKS namespace or ECS tasks — per ADR-001 default)
- Managed PostgreSQL (Aurora Serverless v2 or RDS)
- S3 buckets (tenant-prefixed)
- SQS queues + EventBridge rules
- Secrets Manager entries
- Structured logging → CloudWatch
- OpenTelemetry → tracing backend
- Basic alerts (health check failures, DLQ depth)
- CI deployment workflow (on merge to main → deploy to dev)
- Database migration execution in pipeline
- Rollback validation (demonstrate Helm rollback or equivalent)

### Explicitly excluded

- Production environment
- Multi-region
- Advanced monitoring/dashboards (H2+)
- Performance testing infrastructure

### Services and packages affected

- `infrastructure/terraform/` (AWS resources)
- `infrastructure/helm/` (deployment charts)
- `.github/workflows/` (deploy step)

### API contracts

N/A

### Events produced and consumed

N/A

### State transitions

N/A

### Database changes

- Migration execution validated in environment

### Security controls

- DP-001 (TLS)
- DP-002 (encryption at rest)
- DP-005 (no secrets in source)
- All TI-\* controls validated in real AWS

### Legacy dependencies

- Existing AWS account access
- Existing VPC/networking (deploy within)

### Acceptance criteria

- [ ] Services deploy from CI on merge
- [ ] Smoke tests pass automatically post-deploy
- [ ] Secrets not in source or container images
- [ ] Database migration runs as part of deployment
- [ ] Rollback demonstrated (previous version restored)
- [ ] Health checks pass in AWS environment
- [ ] Logs visible in CloudWatch with correlation IDs
- [ ] Security control evidence generated (TI-005 cross-tenant test in AWS)

### Automated tests

- Smoke tests post-deployment
- Health check verification

### Operational evidence

- CI deployment history
- CloudWatch log groups
- Health check dashboard

### Reconciliation requirements

N/A

### Dependencies

- GP-00 through GP-13 (services to deploy)
- AWS account access
- Terraform state backend configured

### Estimated effort

4-5 days

### Exit gate

Golden-path services deploy from CI. Smoke tests pass. Secrets secure.
Restore and rollback demonstrated. Security evidence generated.

---

## GP-16: Controlled Pilot and Cutover Rehearsal

### Business outcome

One controlled workload runs through CareCareer end-to-end in shadow mode,
with reconciliation evidence sufficient for cutover decision.

### Included capabilities

- Pilot tenant/branch configuration
- Worker and facility selection (scope definition)
- Shadow run execution (real Symplr shifts → CareCareer parallel)
- Reconciliation across all domains (eligibility, shifts, timecards, pay/bill)
- Operational training materials
- Cutover simulation (switch source of truth)
- Rollback simulation (revert to Symplr within target time)
- Sign-off package (evidence for all gates)

### Explicitly excluded

- Production cutover (that's a business decision, not a backlog item)
- Non-pilot regions/tenants

### Services and packages affected

- All golden-path services
- Migration adapters
- Reconciliation tooling

### API contracts

- All golden-path APIs exercised end-to-end

### Events produced and consumed

- All golden-path events verified end-to-end

### State transitions

- Full shift lifecycle: DRAFT → ... → CLOSED
- Full timecard lifecycle: GENERATED → ... → EXPORT_READY

### Database changes

N/A (using existing schemas)

### Security controls

- All security controls validated end-to-end

### Legacy dependencies

- Symplr operational (running real shifts for comparison)
- Maestra operational (running real timecards for comparison)

### Acceptance criteria

- [ ] All reconciliation thresholds pass (30 consecutive days)
- [ ] No unresolved high-severity security defects
- [ ] Finance approves pay/bill comparisons
- [ ] Operations approves workflow behavior
- [ ] Rollback completed within documented target (4 hours)
- [ ] Pilot decision recorded with evidence
- [ ] All mandatory security-control evidence collected

### Automated tests

- End-to-end golden-path scenarios
- Reconciliation batch runs
- Rollback automation test

### Operational evidence

- 30-day reconciliation report
- Security control evidence package
- Performance baseline under pilot load
- Incident response tested

### Reconciliation requirements

- All domains meet thresholds defined in data-ownership-matrix.md

### Dependencies

- GP-00 through GP-15 complete
- Symplr replicated DB access operational
- Pilot scope agreed with operations

### Estimated effort

5-7 days (execution + observation period extends beyond)

### Exit gate

All mandatory reconciliation thresholds pass.
Finance and operations sign off.
Rollback demonstrated.
Pilot decision recorded.

---

## Summary Timeline

| Slice | Dependency          | Estimated Days | Cumulative |
| ----- | ------------------- | :------------: | :--------: |
| GP-00 | None                |      2-3       |     3      |
| GP-01 | GP-00               |      3-4       |     7      |
| GP-02 | GP-01               |      3-4       |     11     |
| GP-03 | GP-01, GP-02        |      4-5       |     16     |
| GP-04 | GP-02, GP-03        |      3-4       |     20     |
| GP-05 | GP-01               |       3        |    14\*    |
| GP-06 | GP-01               |      2-3       |    14\*    |
| GP-07 | GP-05, GP-06        |      4-5       |    19\*    |
| GP-08 | GP-05, GP-07        |       3        |    22\*    |
| GP-09 | GP-07, GP-08        |       3        |    25\*    |
| GP-10 | GP-09               |      3-4       |    29\*    |
| GP-11 | GP-10               |       4        |    33\*    |
| GP-12 | GP-11               |      4-5       |    38\*    |
| GP-13 | GP-12               |      5-6       |    44\*    |
| GP-14 | GP-07, GP-12, GP-13 |      5-6       |    44\*    |
| GP-15 | GP-00+              |      4-5       | (parallel) |
| GP-16 | All                 |      5-7       |  49-51\*   |

\*With parallelization (platform track + domain track), total elapsed: ~7-9 weeks.

GP-05/06/07 can run parallel with GP-02/03/04 on separate tracks.
GP-15 can run parallel with domain slices once GP-01 is complete.
