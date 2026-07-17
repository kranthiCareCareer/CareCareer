# CareCareer GP-02 Final Hardening, DEMO-01, and Chromium Validation

## Binding Master Engineering Specification

> **Repository location:** save this file as:
>
> `docs/execution/GP02-DEMO01-MASTER-SPEC.md`

This document is the binding engineering specification for completing GP-02, creating DEMO-01, and validating the complete solution through automated Chromium browser tests.

The coding agent must not attempt to complete this entire specification in one uncontrolled pass. It must execute the work through the checkpoint prompts defined near the end of this document, with one focused commit and evidence report per checkpoint.

---

# 1. Product Objective

CareCareer is being built as a secure, multi-tenant healthcare workforce platform that will progressively replace or consolidate capabilities currently provided by systems such as:

- Bullhorn
- Symplr CTM
- LaborEdge
- Maestra
- Other licensed staffing, scheduling, credentialing, timekeeping, recruiting, and workforce-management tools

The long-term business flow is:

```text
Customer onboarding
→ identity and access
→ facilities and client setup
→ worker onboarding
→ credentialing
→ jobs and shifts
→ matching and booking
→ clock-in and time submission
→ approval
→ pay and bill preview
→ reporting and integrations
```

The current implementation is the secure platform control plane beneath those future workflows.

The next visible milestone is a Platform Administration Console that demonstrates:

- Tenant provisioning
- Multi-tenant isolation
- Organizations and branches
- Product entitlements
- Feature configuration
- Tenant lifecycle
- Administrative authorization
- Audit history
- Transactional integrity
- Browser-validated business flows

---

# 2. Current Repository Checkpoint

Reported current state:

```text
Branch: master
Commit: 93b26e2
```

Reported tags:

```text
gp-00-baseline
gp-01-packages-complete
gp-01-service-template
gp-02-platform-service
gp-02-platform-service-hardened
```

Reported test evidence:

```text
Unit tests:                         155
Platform-service integration:       33
Shared testing integration:          8
Combined evidence:                 196
```

Reported shared packages:

```text
@carecareer/config
@carecareer/request-context
@carecareer/database
@carecareer/auth
@carecareer/events
@carecareer/idempotency
@carecareer/observability
@carecareer/testing
@carecareer/service-core
@carecareer/service-template
```

Reported platform-service capabilities:

```text
Tenant
Organization
Branch
EntitlementSet
FeatureConfiguration
Tenant lifecycle
Transactional outbox
Dedicated audit records
PostgreSQL RLS
Optimistic concurrency
Idempotency
```

Before modifying anything, the coding agent must:

1. Inspect the actual repository.
2. Confirm branch, commit, tags, and working-tree status.
3. Run the existing quality gates.
4. Inspect the actual test implementations.
5. Confirm that real PostgreSQL is used where claimed.
6. Confirm unit and integration suites are separated correctly.
7. Record any discrepancy between this specification and the repository.

Do not assume reported claims are correct without verification.

---

# 3. Non-Negotiable Engineering Rules

## 3.1 Preserve the approved architecture

Maintain:

- Strict TypeScript
- NestJS backend
- PostgreSQL
- PostgreSQL Row-Level Security
- Transaction-local tenant context
- Transactional outbox
- Dedicated audit persistence
- Provider-neutral authentication abstractions
- Shared package boundaries
- Zod request validation
- Optimistic concurrency
- Multi-stage non-root Docker images
- pnpm workspace conventions
- Existing linting and formatting rules

## 3.2 Maintain package boundaries

Cross-package imports must use package exports:

```ts
import { something } from '@carecareer/database';
```

Do not use relative imports into another package:

```ts
../../../packages/database/src/...
```

Service-local relative imports are allowed only within that service.

Any ESLint exception must be narrowly scoped and must not weaken cross-package boundary enforcement.

## 3.3 Do not introduce shortcuts

Do not:

- Disable RLS to make tests pass
- Give the runtime role `BYPASSRLS`
- Give the runtime role table ownership
- Use a database superuser for application behavior
- Replace idempotency with tenant-slug uniqueness
- Treat outbox events as audit records
- Create a fake production identity system
- Hardcode UI business records instead of calling the real API
- Let the UI query PostgreSQL directly
- Use arbitrary delays in browser tests
- Hide errors behind optimistic UI behavior
- Claim a test passed without running it
- Claim production readiness before all gates pass

## 3.4 Cross-platform development

The primary developer may run the repository on Windows.

Root scripts must work on:

- Windows
- macOS
- Linux
- CI Linux runners

Avoid Bash-only orchestration and Unix-only environment variable syntax.

Use:

- Node or TypeScript orchestration scripts
- Docker Compose
- cross-platform package scripts
- approved cross-platform utilities

---

# 4. Required Execution Order

Execute in this order:

```text
Checkpoint 1 — HTTP authentication and authorization
Checkpoint 2 — Tenant-state enforcement and controller contracts
Checkpoint 3 — OpenAPI, Docker validation, final GP-02 gate and tag
Checkpoint 4 — DEMO-01 frontend shell and core screens
Checkpoint 5 — Demo orchestration, personas, and seed data
Checkpoint 6 — Playwright Chromium automation
Checkpoint 7 — Executive demo flow, CI, and documentation
```

Do not begin GP-03 identity-service during this specification.

Do not create or move the `gp-02-platform-service-final` tag until checkpoints 1–3 pass.

---

# 5. GP-02 Final Hardening

The current status must be treated as:

> GP-02 Platform Service — Database, Domain, Lifecycle, Audit, and Idempotency Hardening Complete; HTTP and Operational Hardening Remaining.

---

## 5.1 Verify true concurrent idempotency

Inspect the reported concurrent idempotency test carefully.

The test must launch at least two simultaneous executions using the same:

- Tenant or platform scope
- Operation name
- Idempotency key
- Request hash
- Request payload

The test must prove:

```text
Two simultaneous requests
→ exactly one business handler executes
→ exactly one tenant is created
→ exactly one initial organization is created
→ exactly one entitlement record set is created
→ exactly one audit record is created
→ exactly one outbox event is created
→ both callers receive the same tenant ID
```

The test must use the real persistence implementation and real PostgreSQL idempotency storage.

An in-memory promise cache or sequential invocation is insufficient.

Also prove:

```text
Same key + same payload
→ original response replayed
→ same tenant ID
→ no duplicate side effects
```

```text
Same key + different payload
→ 409 IDEMPOTENCY_CONFLICT
→ no new tenant, audit, or outbox records
```

Document behavior for:

- `IN_PROGRESS`
- `COMPLETED`
- retries
- timeouts
- abandoned requests
- stale in-progress records

Do not mark an idempotency record complete before the business transaction commits.

---

## 5.2 Complete suspended and deactivated tenant enforcement

A unit-level tenant status guard is necessary but insufficient.

Integrate tenant-status enforcement into the actual application-command path.

Protected tenant operations must evaluate:

```text
Tenant exists
→ request tenant matches
→ tenant status permits the operation
→ required entitlement exists
→ feature configuration permits behavior
→ actor has permission
→ mutation executes
```

Prove through application and HTTP tests:

1. ACTIVE tenant mutation succeeds.
2. SUSPENDED tenant mutation returns `TENANT_SUSPENDED`.
3. DEACTIVATED tenant mutation returns `TENANT_DEACTIVATED`.
4. PROVISIONING tenant cannot perform normal business mutations.
5. Denied operations produce no domain changes.
6. Denied operations produce no audit record.
7. Denied operations produce no outbox event.
8. Administrative remediation uses an explicit privileged path.
9. Administrative remediation is audited.
10. DEACTIVATED remains terminal.

Do not depend only on controller checks. Commands invoked by future asynchronous consumers must receive the same protection.

---

## 5.3 Implement real HTTP authentication

Use the existing provider-neutral authentication package.

Do not implement:

- Password storage
- Password login
- Token issuance
- User registration
- Production identity-provider integration
- GP-03 identity-service

For GP-02, use signed test identities and a demo-only identity mechanism.

Required HTTP behavior:

```text
Missing Authorization header             → 401
Malformed Authorization header           → 401
Invalid JWT                               → 401
Expired JWT                               → 401
Valid JWT without required permission     → 403
Tenant administrator provisioning tenant  → 403
Platform administrator provisioning       → 201
Cross-tenant resource access              → 404-equivalent response
```

A cross-tenant request must not reveal whether the other tenant’s resource exists.

Use stable permission identifiers:

```text
platform.tenant.provision
platform.tenant.read
platform.tenant.update
platform.organization.create
platform.branch.create
platform.entitlements.manage
platform.features.manage
platform.audit.read
```

Test the real NestJS guards and middleware, not only isolated helper functions.

Verify the complete flow:

```text
Authorization header
→ JWT verification
→ claims mapping
→ request context
→ tenant context
→ permission guard
→ controller
→ command/query handler
```

Confirm:

- Actor ID reaches the command
- Tenant ID reaches tenant-scoped database execution
- Correlation ID reaches audit and outbox records
- Platform-administrator provisioning uses the explicit administrative path
- Tenant identities cannot invoke platform-administrative provisioning
- Missing or invalid authentication never invokes commands
- Permission failures create no domain, audit, or outbox records

---

## 5.4 Complete controller contract testing

Test the actual NestJS HTTP boundary.

### Request validation

Cover:

- Unknown JSON fields rejected
- Malformed UUID rejected
- Missing required field rejected
- Blank names rejected
- Oversized values rejected
- Unsupported entitlement key rejected
- Unsupported feature key rejected
- Invalid feature configuration rejected
- Invalid lifecycle reason rejected
- Invalid expected version rejected

### Header validation

Cover:

- Missing `Idempotency-Key`
- Blank idempotency key
- Oversized idempotency key
- Missing expected-version header where required
- Malformed expected-version header
- Valid correlation ID accepted
- Correlation ID generated when absent

### Response contracts

Verify:

```text
201 Created
200 OK
204 No Content, only if selected consistently
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 VERSION_CONFLICT
409 IDEMPOTENCY_CONFLICT
409 INVALID_STATE_TRANSITION
422 Domain validation error, only if approved
```

Error responses must use the shared error envelope.

Verify:

- Correlation ID appears in responses
- Correlation ID appears in audit records
- Correlation ID appears in outbox events
- Validation failures do not invoke repositories
- Validation failures create no audit or outbox records
- Sensitive values are absent from responses and logs

---

## 5.5 Complete lifecycle HTTP and application tests

Prove the full path:

```text
HTTP request
→ authentication
→ authorization
→ validation
→ command handler
→ aggregate transition
→ optimistic update
→ audit insertion
→ outbox insertion
→ commit
→ response
```

Required transitions:

```text
PROVISIONING → ACTIVE
ACTIVE → SUSPENDED
SUSPENDED → ACTIVE
ACTIVE → DEACTIVATED
SUSPENDED → DEACTIVATED
```

Required rejection cases:

```text
PROVISIONING → SUSPENDED
DEACTIVATED → ACTIVE
DEACTIVATED → SUSPENDED
same-state invalid transition
stale expected version
suspended protected mutation
deactivated protected mutation
```

Every successful transition creates:

- One state change
- One audit record
- One outbox event

Every rejected transition creates:

- No state change
- No audit record
- No outbox event

---

## 5.6 Confirm audit append-only enforcement

Verify runtime-role privileges:

```sql
GRANT SELECT, INSERT ON audit_records TO app_service;

REVOKE UPDATE, DELETE, TRUNCATE
ON audit_records
FROM app_service;
```

Prove against real PostgreSQL:

- INSERT succeeds
- Authorized SELECT succeeds
- UPDATE fails
- DELETE fails
- TRUNCATE fails
- Existing record remains unchanged
- Domain rollback removes an uncommitted audit record
- Maintenance cleanup uses a separate role
- Runtime credentials cannot assume the maintenance role

Do not call audit records immutable until these controls pass.

---

## 5.7 Add demo-required read APIs before freezing GP-02

Inspect whether these APIs exist:

```text
GET /v1/platform/dashboard
GET /v1/platform/tenants
GET /v1/tenants/{tenantId}/audit-records
```

Implement only the minimum required endpoints if absent.

### Dashboard response

Include:

- Total tenant count
- Tenant count by lifecycle status
- Organization count
- Branch count
- Enabled entitlement counts
- Recent administrative activity

### Tenant list

Support:

- Pagination
- Status filter
- Text search
- Stable ordering
- Platform-admin authorization
- No unbounded scans

### Audit history

Support:

- Tenant-scoped access
- Pagination
- Action filter
- Actor filter if required
- Stable reverse chronological order
- Read-only responses
- Redacted sensitive values

Do not create a generic database-browser API.

---

## 5.8 OpenAPI contract validation

Generate and commit the platform-service OpenAPI specification.

Verify it accurately describes:

- Every implemented endpoint
- Authentication
- Permissions
- Required headers
- Path parameters
- Query parameters
- Request schemas
- Response schemas
- Error envelopes
- Lifecycle enums
- Entitlement keys
- Feature keys
- Pagination
- Idempotency behavior
- Version-conflict behavior

Add automated validation of important OpenAPI definitions against actual controller behavior.

The frontend API client must use this frozen contract.

---

## 5.9 Production Docker validation

Build the real image:

```bash
docker build \
  -f services/platform-service/Dockerfile \
  -t carecareer/platform-service:gp-02-final .
```

Prove:

- Runtime UID is not `0`
- Runtime GID is non-privileged
- Container starts successfully
- Health endpoint succeeds
- Readiness reflects database availability
- Graceful shutdown works
- Only production dependencies are present
- `.env` files are absent
- Git metadata is absent
- Unit and integration tests are absent
- Test fixtures are absent
- Credentials and tokens are absent
- Development-only tools are absent
- Configuration comes from environment variables
- Filesystem permissions are appropriate
- Image labels identify service, version, commit, and build time where approved
- No unnecessary ports are exposed

Add a repeatable script:

```text
pnpm --filter @carecareer/platform-service docker:verify
```

---

## 5.10 GP-02 final exit gate

Run suites separately:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm --filter @carecareer/testing test:integration
pnpm --filter @carecareer/platform-service test:integration
pnpm build
pnpm --filter @carecareer/platform-service docker:verify
```

Report:

```text
Unit suite:
Shared integration suite:
Platform-service integration suite:
HTTP contract suite:
Docker verification:
Combined evidence:
```

Only after every gate succeeds:

```bash
git tag gp-02-platform-service-final
```

Do not move the tag if failures remain.

Commit the final OpenAPI contract with the tag.

---

# 6. DEMO-01 Platform Administration Console

After `gp-02-platform-service-final` exists, create:

```text
apps/platform-admin-console
```

Use:

- Vite
- React
- TypeScript strict mode
- shadcn/ui
- Existing workspace linting and formatting
- Responsive desktop-first layout
- Light theme
- Real platform-service REST API
- No Redux
- No unnecessary global state framework
- No hardcoded business records

Use a small typed API layer. Generate types from the committed OpenAPI contract where practical.

---

## 6.1 Demo UI purpose

The console must clearly communicate:

> CareCareer can securely onboard and manage multiple staffing organizations while enforcing tenant isolation, product access, lifecycle control, and auditability.

Target audiences:

- CEO
- CTO
- Product leadership
- Engineering leadership
- Investors or acquisition stakeholders
- Internal operations stakeholders

---

## 6.2 Required screens

### Demo persona selection

Because identity-service does not yet exist, create a clearly labeled demo-only persona selector:

```text
Platform Administrator
MAS Tenant Administrator
CareShield Tenant Administrator
Read-Only Auditor
```

The selector must obtain a short-lived signed development JWT through a demo-only mechanism.

Required controls:

- Disabled by default
- Enabled only by explicit demo/local configuration
- Backend rejects demo authentication in production mode
- No hardcoded production signing secret
- Demo token exposes tenant and permission context
- Switching persona clears cached tenant data

Do not present this as production login.

### Dashboard

Show:

- Total tenants
- Active tenants
- Provisioning tenants
- Suspended tenants
- Deactivated tenants
- Organizations
- Branches
- Enabled module totals
- Recent administrative activity

### Tenant list

Columns:

- Tenant name
- Tenant code or slug
- Status
- Organization count
- Branch count
- Enabled modules
- Last updated
- Actions

Functions:

- Search
- Filter by status
- Pagination
- Open tenant
- Create tenant

### Create tenant

Fields:

- Tenant name
- Tenant slug
- Initial organization
- Region or timezone if supported
- Initial entitlements
- Provisioning reason

Submission must:

- Generate or send an idempotency key
- Disable repeated submission while pending
- Handle replay safely
- Display correlation ID
- Navigate to created tenant
- Display stable server validation errors
- Never simulate success locally

### Tenant overview

Show:

- Tenant identity
- Lifecycle status
- Version
- Created and updated metadata
- Organization and branch totals
- Enabled entitlements
- Recent audit events
- Allowed lifecycle actions

### Organizations and branches

Support:

- List organizations
- Create organization
- List branches
- Create branch
- Parent relationships
- Empty states
- Permission-denied states
- Cross-tenant protection

### Entitlements

Display approved capabilities:

```text
workforce
credentialing
scheduling
timekeeping
pay_bill_preview
recruiting
```

Explain that entitlements represent purchased or authorized modules.

Updates must use optimistic concurrency.

### Feature configuration

Show typed controls only for entitled modules.

Examples:

```text
scheduling.auto_confirm_enabled
timekeeping.geofence_required
timekeeping.allowed_clock_in_minutes
```

The backend remains authoritative even when the UI disables controls.

### Lifecycle management

Actions:

- Activate
- Suspend
- Reactivate
- Deactivate

Require:

- Confirmation dialog
- Reason
- Expected version
- Terminal-state warning
- Stable error handling
- No invalid action buttons

### Audit timeline

Display:

- Timestamp
- Actor
- Action
- Resource type
- Resource ID
- Reason
- Before summary
- After summary
- Correlation ID

Audit history must be read only and sensitive values redacted.

---

# 7. Demo Data and Local Orchestration

Create deterministic tenants:

```text
MAS Medical Staffing       ACTIVE
CareShield                 PROVISIONING
Demo Regional Staffing     SUSPENDED
```

Include:

- Multiple organizations
- Multiple branches
- Different entitlement combinations
- Typed feature settings
- Audit events
- At least one lifecycle transition history

Provide root commands:

```bash
pnpm demo:up
pnpm demo:reset
pnpm demo:down
```

## `pnpm demo:up`

Must:

1. Start PostgreSQL
2. Wait for readiness
3. Apply migrations
4. Create roles
5. Apply grants and RLS policies
6. Seed deterministic demo data
7. Start platform-service on port 3001
8. Wait for readiness
9. Start admin console on port 4000
10. Print URLs and persona instructions

## `pnpm demo:reset`

Must:

1. Stop active demo requests safely
2. Clear demo data with the maintenance role
3. Reapply migrations if needed
4. Re-seed deterministic data
5. Restore the known demo state

## `pnpm demo:down`

Must stop only demo services and containers without deleting unrelated Docker resources or developer files.

No manual SQL should be required.

---

# 8. Automated Chromium Validation

Use the latest stable compatible `@playwright/test` version at implementation time and commit the exact version in the lockfile.

Use Playwright-managed Chromium.

Do not depend on a manually installed Chrome browser.

Suggested structure:

```text
apps/platform-admin-console/
├── playwright.config.ts
├── e2e/
│   ├── fixtures/
│   │   ├── personas.ts
│   │   ├── api.ts
│   │   └── demo-data.ts
│   ├── pages/
│   │   ├── persona-selector.page.ts
│   │   ├── dashboard.page.ts
│   │   ├── tenant-list.page.ts
│   │   ├── tenant-create.page.ts
│   │   ├── tenant-detail.page.ts
│   │   ├── entitlements.page.ts
│   │   ├── features.page.ts
│   │   ├── lifecycle.page.ts
│   │   └── audit.page.ts
│   └── specs/
│       ├── authentication.spec.ts
│       ├── tenant-provisioning.spec.ts
│       ├── tenant-isolation.spec.ts
│       ├── organizations-branches.spec.ts
│       ├── entitlements-features.spec.ts
│       ├── lifecycle.spec.ts
│       ├── audit.spec.ts
│       ├── validation-errors.spec.ts
│       └── executive-demo.spec.ts
```

Page objects must improve readability but must not hide assertions or business logic.

---

## 8.1 Playwright configuration

Configure:

```text
Browser: Chromium desktop
Viewport: 1440 × 900
Base URL: http://localhost:4000
API URL: http://localhost:3001
Headless by default
One worker for stateful demo flows
Parallel only for isolated scenarios
forbidOnly in CI
Retries only in CI
HTML reporter
Trace on first retry
Screenshot on failure
Video retained on failure
```

Do not start tests until:

- PostgreSQL is ready
- Migrations are complete
- Seed data is loaded
- Platform-service is ready
- Admin console is ready

Store artifacts in ignored directories:

```text
playwright-report/
test-results/
artifacts/demo-screenshots/
```

---

## 8.2 Required root commands

Add:

```bash
pnpm demo:e2e
pnpm demo:e2e:headed
pnpm demo:e2e:ui
pnpm demo:e2e:debug
pnpm demo:e2e:report
pnpm demo:e2e:record
pnpm demo:verify
```

### `pnpm demo:e2e`

- Runs complete Chromium suite headlessly
- Uses real frontend, backend, and PostgreSQL
- Produces an HTML report

### `pnpm demo:e2e:headed`

- Opens Chromium visibly
- Uses one worker
- Runs primary demo flows
- Lets the user watch the browser

### `pnpm demo:e2e:ui`

- Opens Playwright UI mode
- Allows interactive running and inspection

### `pnpm demo:e2e:debug`

- Opens Playwright Inspector

### `pnpm demo:e2e:report`

- Opens the latest HTML report

### `pnpm demo:e2e:record`

- Starts Playwright code generation against the local app
- Generated tests must be reviewed before commit

### `pnpm demo:verify`

Must:

1. Start or reset the demo stack
2. Run backend unit tests
3. Run platform integration tests
4. Run frontend unit tests
5. Run Chromium E2E tests
6. Save reports and screenshots
7. Shut down transient resources
8. Exit nonzero on failure

---

# 9. Required Browser Scenarios

All primary scenarios must interact with the real application through the browser.

API-only setup may be used for preconditions, but business behavior must be verified through visible UI controls.

## 9.1 Startup

Prove:

- Persona screen loads
- Dashboard loads
- API readiness failures display gracefully
- Database unavailable state is understandable
- No unhandled console errors
- No unexpected failed network requests on successful paths

Fail on unexpected browser console errors.

## 9.2 Platform administrator provisioning

Through Chromium:

1. Select Platform Administrator.
2. Open tenant list.
3. Click Create Tenant.
4. Enter tenant information.
5. Select entitlements.
6. Submit.
7. Wait for the real API response.
8. Verify success.
9. Verify tenant details.
10. Verify initial organization.
11. Verify entitlements.
12. Verify audit entry.
13. Verify correlation ID.
14. Refresh.
15. Verify persistence.

## 9.3 Duplicate submission and idempotency

Prove:

- Submit button disables while pending
- Rapid repeated action does not create duplicates
- Retry with same key returns same tenant
- Same key with changed payload shows `IDEMPOTENCY_CONFLICT`
- Exactly one tenant, audit record, and outbox event exists

Do not rely only on button disabling.

## 9.4 Validation

Test:

- Required fields
- Invalid slug
- Oversized names
- Unsupported values
- Invalid entitlement combinations
- Malformed UUID routes
- Missing idempotency key through a controlled request
- Server validation message rendering
- Focus moves to first invalid field
- Form values persist after recoverable errors

## 9.5 Tenant isolation

1. Select MAS Tenant Administrator.
2. Open MAS tenant.
3. Verify MAS data.
4. Navigate directly to CareShield tenant URL.
5. Verify 404-equivalent behavior.
6. Verify CareShield identity is not disclosed.
7. Attempt cross-tenant update.
8. Verify failure.
9. Switch to CareShield Tenant Administrator.
10. Verify CareShield data.
11. Verify cached MAS data is cleared.

## 9.6 Organizations and branches

Prove:

- List loads
- Organization creation succeeds
- Branch creation succeeds
- Parent relationship is correct
- Duplicate constraints return usable errors
- Refresh persists data
- Unauthorized persona cannot create
- Suspended tenant cannot create
- Failed mutation creates no audit or outbox record

## 9.7 Entitlements and features

1. Enable entitlement.
2. Verify feature controls appear.
3. Configure typed feature.
4. Save.
5. Refresh.
6. Verify persistence.
7. Disable entitlement.
8. Verify feature unavailable.
9. Attempt backend bypass.
10. Verify rejection.
11. Verify audit before/after.
12. Verify no sensitive leakage.

## 9.8 Lifecycle

Through the UI:

```text
PROVISIONING → ACTIVE
ACTIVE → SUSPENDED
SUSPENDED → ACTIVE
ACTIVE → DEACTIVATED
```

Verify:

- Confirmation dialog
- Reason required
- Version supplied
- Status badge updates
- Audit record appears
- Correlation ID matches
- Suspended tenant mutation rejected
- Reactivated tenant mutation succeeds
- Deactivated tenant has no reactivate action
- Direct reactivation attempt rejected
- Stale version shows `VERSION_CONFLICT`
- Refresh shows current version

## 9.9 Audit timeline

Verify:

- Reverse chronological order
- Actor
- Action
- Resource
- Reason
- Correlation ID
- Before/after summary
- Redaction
- Read-only behavior
- Cross-tenant audit access denied
- Auditor can read but not mutate

## 9.10 Authentication and authorization

Test:

```text
No token                     → sign-in or 401 state
Invalid token                → rejected
Expired token                → rejected
Insufficient permission      → forbidden
Platform administrator       → provisioning allowed
Tenant administrator         → provisioning denied
Read-only auditor            → reads allowed, writes denied
```

## 9.11 Error and resilience

Test graceful handling of:

- API unavailable
- Request timeout
- Database readiness failure
- 400
- 401
- 403
- 404 hidden resource
- 409 version conflict
- 409 idempotency conflict
- 500 unexpected error

The UI must:

- Avoid blank screens
- Preserve safe input where possible
- Show correlation ID
- Offer retry when appropriate
- Hide stack traces
- Hide raw database errors

---

# 10. Executive Demonstration Flow

Create:

```text
executive-demo.spec.ts
```

The visible flow must demonstrate:

1. Platform Administrator persona
2. Dashboard
3. Create MAS Demo tenant
4. Show organization and branch
5. Enable Scheduling and Timekeeping
6. Configure geofence and clock-in window
7. Show audit history
8. Open CareShield tenant
9. Switch persona and demonstrate isolation
10. Suspend MAS Demo
11. Attempt protected mutation and show rejection
12. Reactivate MAS Demo
13. Retry mutation and show success
14. Return to dashboard

Save screenshots:

```text
01-dashboard.png
02-create-tenant.png
03-tenant-overview.png
04-entitlements.png
05-feature-settings.png
06-tenant-isolation.png
07-suspended-tenant.png
08-audit-history.png
```

Must run with:

```bash
pnpm demo:e2e:headed --grep "Executive demo"
```

---

# 11. Browser-Test Quality Rules

Prefer locators in this order:

1. Accessible role and name
2. Associated label
3. Stable visible text
4. Test ID only when necessary

Do not use:

- Deep CSS selectors
- XPath unless unavoidable
- Positional selectors tied to implementation
- `waitForTimeout`
- Hardcoded database IDs
- Order-dependent tests unless explicitly serial
- Shared mutable state across parallel tests

Use:

- Auto-waiting assertions
- Network-response assertions for mutations
- Deterministic seed data
- Unique suffixes
- API fixtures for setup and verification
- Storage cleanup between personas
- Stable page objects
- Explicit assertions after each action

Fail tests when:

- Browser console has unexpected errors
- API requests fail unexpectedly
- React has uncaught errors
- Required audit or outbox effects are missing

---

# 12. Frontend Unit and Component Tests

Use Vitest and React Testing Library.

Cover:

- Tenant status badge
- Entitlement controls
- Feature forms
- Lifecycle confirmation dialog
- Error envelope rendering
- Loading states
- Empty states
- Permission-controlled actions
- Audit timeline
- API client correlation ID handling
- Idempotency-key reuse during retry
- Persona switch clearing cached data

Component tests may mock HTTP.

Primary Playwright flows must not mock platform-service.

---

# 13. Visual and Accessibility Validation

Add visual smoke coverage for:

- Dashboard
- Tenant list
- Tenant details
- Entitlements
- Audit history

Use deterministic data and fixed viewport.

Do not automatically update baselines in CI.

Validate:

- Keyboard navigation
- Visible focus
- Labels
- Dialog focus trapping
- Accessible button names
- Status not communicated by color alone
- Table headers
- Error announcements
- Logical tab order

Do not block the first demo on perfect visual-regression coverage, but capture the primary executive flow automatically.

---

# 14. CI Workflow

Add:

```text
.github/workflows/demo-e2e.yml
```

Workflow must:

1. Check out repository
2. Install approved Node and pnpm
3. Install locked dependencies
4. Install Playwright Chromium and system dependencies
5. Start PostgreSQL or Docker Compose
6. Apply migrations
7. Seed data
8. Start platform-service
9. Start admin console
10. Wait for readiness
11. Run Chromium tests
12. Upload HTML report
13. Upload traces, screenshots, and videos on failure
14. Shut down services
15. Fail if `test.only` exists
16. Fail if the working tree changes unexpectedly

Use one CI worker initially.

---

# 15. Required Deliverables

Expected repository content:

```text
services/platform-service/
├── completed HTTP authentication and authorization
├── completed tenant-state enforcement
├── completed controller contract tests
├── completed OpenAPI contract
├── demo-required read endpoints
├── Docker verification script
└── final integration evidence

apps/platform-admin-console/
├── production-quality demo UI
├── typed API client
├── demo persona selector
├── unit tests
├── Playwright config
├── Chromium E2E tests
├── executive demo flow
└── visual artifacts

scripts/
├── demo-up orchestration
├── demo-reset orchestration
├── demo-down orchestration
├── demo-verify orchestration
└── cross-platform readiness checks

docker-compose.demo.yml

.github/workflows/demo-e2e.yml

docs/demo/
├── DEMO-01-README.md
├── DEMO-01-WALKTHROUGH.md
├── DEMO-01-ARCHITECTURE.md
├── DEMO-01-TEST-MATRIX.md
└── DEMO-01-TROUBLESHOOTING.md
```

---

# 16. Ten-Minute Demo Walkthrough

## Minute 0–1

Explain:

> CareCareer is a multi-tenant healthcare workforce platform. This milestone proves that staffing companies can be securely onboarded, configured, isolated, governed, and audited.

## Minute 1–3

Create:

```text
Tenant: MAS Demo
Organization: MAS Medical Staffing
Branch: Manchester, NH
```

## Minute 3–5

Enable:

```text
Workforce
Scheduling
Credentialing
Timekeeping
```

Configure:

```text
Geofence required: Yes
Clock-in window: 15 minutes
```

## Minute 5–7

Switch between MAS and CareShield personas.

Show isolation.

## Minute 7–9

Suspend MAS.

Attempt protected mutation.

Show `TENANT_SUSPENDED`.

Reactivate MAS and retry successfully.

## Minute 9–10

Show audit history, Chromium report, and PostgreSQL integration evidence.

---

# 17. Completion Criteria

## GP-02

Complete only when:

- HTTP authentication passes
- HTTP authorization passes
- Suspended/deactivated command enforcement passes
- Idempotency replay passes
- Idempotency conflict passes
- Concurrent same-key execution passes against real persistence
- Controller contracts pass
- Audit append-only enforcement passes
- OpenAPI validation passes
- Docker verification passes
- Full gate passes
- `gp-02-platform-service-final` is tagged

## DEMO-01

Complete only when:

- Console runs against real API
- Stack starts with one command
- Data resets with one command
- Platform admin can provision tenant
- Isolation is visible
- Entitlements and features work
- Lifecycle works
- Audit history works
- Persona authorization works
- Headless Chromium passes
- Headed Chromium can be watched
- Playwright UI mode works
- HTML report opens
- Failure artifacts are retained
- Executive demo flow passes

---

# 18. Required Final Commands

All must work from repository root:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test

pnpm --filter @carecareer/testing test:integration
pnpm --filter @carecareer/platform-service test:integration

pnpm build
pnpm --filter @carecareer/platform-service docker:verify

pnpm demo:up
pnpm demo:reset
pnpm demo:e2e
pnpm demo:e2e:headed
pnpm demo:e2e:ui
pnpm demo:e2e:report
pnpm demo:verify
pnpm demo:down
```

---

# 19. Commit Strategy

Use one verifiable commit per checkpoint:

```text
1. GP-02 HTTP authentication and authorization
2. Tenant-state enforcement and controller contracts
3. OpenAPI, Docker verification, final GP-02 gate and tag
4. DEMO-01 application shell and core screens
5. Demo personas, seed data, and orchestration
6. Playwright Chromium suite
7. Executive demo, CI, and documentation
```

Do not mix unrelated refactors.

Do not delete or move existing tags.

---

# 20. Reporting Requirements

After each checkpoint, report:

```text
Commit:
Files changed:
Behavior implemented:
Tests added:
Commands executed:
Unit results:
Integration results:
Browser results:
Known gaps:
Next checkpoint:
```

At final completion, provide:

1. Exact commit and tags
2. Exact test counts by suite
3. Docker verification evidence
4. Chromium results
5. Path to HTML report
6. Paths to screenshots, traces, and videos
7. Demo startup instructions
8. Ten-minute walkthrough
9. Known limitations
10. Recommended next milestone

Report only observed evidence, not estimates.

---

# 21. Next-Milestone Restriction

Do not begin:

```text
GP-03 identity-service
```

until both conditions are true:

```text
gp-02-platform-service-final exists
DEMO-01 executive Chromium flow passes
```

After DEMO-01:

```text
GP-03 identity-service
→ users, memberships, roles, invitations
→ first staffing vertical
→ facility
→ shift
→ worker
→ assignment
→ timecard
→ pay and bill preview
```
