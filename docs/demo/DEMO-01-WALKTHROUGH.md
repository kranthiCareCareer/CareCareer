# DEMO-01 Executive Walkthrough

## 10-Minute Platform Administration Demo

### Prerequisites

```bash
pnpm demo:up
pnpm --filter @carecareer/platform-service dev
pnpm --filter @carecareer/platform-admin-console dev
```

### Flow

#### 1. Persona Selection (30 seconds)

Open http://localhost:4000. The demo persona selector appears with a clear "DEMO MODE" badge indicating this is not production authentication.

Select **Platform Administrator** — full platform access.

#### 2. Dashboard (1 minute)

The dashboard shows aggregate statistics:

- Total tenants, broken down by lifecycle status
- Organization and branch counts
- Recent administrative activity

Navigate to the Tenants section.

#### 3. Create a Tenant (2 minutes)

Click "Create Tenant". Fill in:

- **Name:** MAS Demo
- **Slug:** mas-demo
- **Organization:** MAS Medical Staffing

Submit. Note:

- The submit button disables (idempotency protection)
- A correlation ID appears on success
- A "View Tenant" link appears

#### 4. Tenant Overview (1 minute)

View the new tenant:

- Status: PROVISIONING
- Version: 1
- Initial organization listed
- Lifecycle actions available

Click "Activate" with reason "Initial setup complete".

#### 5. Entitlements (1 minute)

Navigate to Entitlements. Enable:

- Scheduling
- Timekeeping

Note: Core is always enabled. Version tracks changes.

#### 6. Feature Configuration (1 minute)

Navigate to Features. Configure:

- **Geofence required:** enabled
- **Clock-in window (before):** 15 minutes

Features are only configurable for entitled modules.

#### 7. Tenant Isolation (1 minute)

Switch to **MAS Tenant Administrator**. Attempt to access a CareShield tenant URL directly. The system returns a 404-equivalent — it does not reveal whether the tenant exists.

#### 8. Lifecycle Enforcement (1.5 minutes)

Switch back to **Platform Administrator**. Suspend the MAS Demo tenant with reason "Policy review".

Try a protected mutation (e.g., update entitlements). The system returns TENANT_SUSPENDED.

Reactivate with reason "Review complete". Retry the mutation — it succeeds.

#### 9. Audit History (1 minute)

View the audit timeline. Every action is recorded:

- Timestamp, actor, action, resource
- Reason provided
- Correlation ID matching the operation
- Before/after state summaries
- Read-only, immutable

### Automated Version

```bash
pnpm demo:e2e:headed --grep "Executive demo"
```

This runs the same flow in Chromium, saving screenshots to `artifacts/demo-screenshots/`.
