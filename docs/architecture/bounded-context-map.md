# CareCareer — Bounded Context Map

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Purpose

This document defines the bounded contexts for the CareCareer platform, their responsibilities, relationships, and communication patterns. It serves as the binding architectural contract for service boundaries.

---

## 2. Context Map Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CARECAREER PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  PLATFORM LAYER (shared infrastructure)                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   TENANT     │  │  IDENTITY    │  │    AUDIT     │  │   POLICY     │   │
│  │  & ENTITLE   │  │  & AUTHZ     │  │              │  │  & CONFIG    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │                  │           │
│─────────┼──────────────────┼──────────────────┼──────────────────┼───────────│
│         │                  │                  │                  │           │
│  WORKFORCE LAYER (people and compliance)                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │   WORKER     │  │  CREDENTIAL  │  │  ONBOARDING  │                      │
│  │              │  │  & COMPLIANCE│  │              │                      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                      │
│         │                  │                  │                              │
│─────────┼──────────────────┼──────────────────┼──────────────────────────────│
│         │                  │                  │                              │
│  OPERATIONS LAYER (demand, supply, and matching)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   CLIENT     │  │  SCHEDULE    │  │   RECRUIT    │  │   ENGAGE     │   │
│  │  & FACILITY  │  │  & ASSIGN    │  │              │  │              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                  │                  │                  │           │
│─────────┼──────────────────┼──────────────────┼──────────────────┼───────────│
│         │                  │                  │                  │           │
│  FINANCIAL LAYER (time, money, and compliance)                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │    TIME      │  │  PAYROLL     │  │   BILLING    │                      │
│  │  & TIMECARD  │  │  PREP        │  │              │                      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                      │
│         │                  │                  │                              │
│─────────┼──────────────────┼──────────────────┼──────────────────────────────│
│         │                  │                  │                              │
│  EXTENDED LAYER (post-golden-path)                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   TRAVEL     │  │  VMS / MSP   │  │  ANALYTICS   │  │ AI PLATFORM  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                               │
│─────────────────────────────────────────────────────────────────────────────│
│                                                                               │
│  MIGRATION LAYER (temporary, retirement-tracked)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   SYMPLR     │  │  BULLHORN    │  │  LABOREDGE   │  │   MAESTRA    │   │
│  │  ADAPTER     │  │  ADAPTER     │  │  ADAPTER     │  │  ADAPTER     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Bounded Context Definitions

### 3.1 Platform Layer

#### TENANT & ENTITLEMENT

| Attribute        | Value                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Owning service   | `platform-service`                                                                            |
| Entities         | Tenant, LegalEntity, Brand, BusinessUnit, Branch, Entitlement, FeatureFlag                    |
| Commands         | CreateTenant, SuspendTenant, UpdateEntitlements, ConfigureFeature                             |
| Events published | `tenant.tenant.provisioned.v1`, `tenant.tenant.suspended.v1`, `tenant.entitlement.changed.v1` |
| Primary store    | Aurora PostgreSQL                                                                             |
| Dependencies     | None (root context)                                                                           |

#### IDENTITY & AUTHORIZATION

| Attribute           | Value                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| Owning service      | `identity-service`                                                                    |
| Entities            | User, Role, Permission, TenantMembership, Invitation, AccessStatus                    |
| Commands            | InviteUser, AssignRole, RevokeAccess, EvaluatePermission                              |
| Events published    | `identity.user.created.v1`, `identity.role.assigned.v1`, `identity.access.revoked.v1` |
| Primary store       | Aurora PostgreSQL                                                                     |
| External dependency | OIDC provider (Auth0/Cognito/Keycloak) for authentication protocols                   |
| Does NOT own        | Passwords, MFA, login flows, token issuance, session management, account recovery     |

#### AUDIT

| Attribute       | Value                                     |
| --------------- | ----------------------------------------- |
| Owning service  | `platform-service` (audit module)         |
| Entities        | AuditEntry, PrivilegedAccessRecord        |
| Commands        | RecordAuditEvent, QueryAuditTrail         |
| Events consumed | All domain events with audit significance |
| Primary store   | Append-only Aurora table + S3 archival    |
| Retention       | 7 years minimum                           |

#### POLICY & CONFIGURATION

| Attribute      | Value                                             |
| -------------- | ------------------------------------------------- |
| Owning service | `platform-service` (policy module)                |
| Entities       | TenantPolicy, BusinessRule, WorkflowConfiguration |
| Commands       | UpdatePolicy, EvaluateRule                        |
| Primary store  | Aurora PostgreSQL                                 |
| Consumed by    | All services (read-only policy evaluation)        |

---

### 3.2 Workforce Layer

#### WORKER

| Attribute        | Value                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Owning service   | `workforce-service` (worker module)                                                         |
| Entities         | Worker, WorkerProfile, Availability, Preference, WorkerDocument, ExternalReference          |
| Commands         | RegisterWorker, UpdateProfile, SetAvailability, UpdatePreferences                           |
| Events published | `worker.worker.registered.v1`, `worker.availability.updated.v1`, `worker.status.changed.v1` |
| Primary store    | Aurora PostgreSQL                                                                           |
| Aggregate root   | Worker                                                                                      |
| Status lifecycle | `APPLICANT → SCREENING → QUALIFIED → CREDENTIALING → READY → ACTIVE → INACTIVE → ALUMNI`    |

#### CREDENTIAL & COMPLIANCE

| Attribute           | Value                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Owning service      | `workforce-service` (credential module)                                                                                                      |
| Entities            | CredentialType, CredentialRequirement, WorkerCredential, VerificationRecord, ComplianceStatus, FacilityRequirementMatrix                     |
| Commands            | SubmitCredential, VerifyCredential, EvaluateEligibility, BlockWorker, ExpireCredential                                                       |
| Events published    | `credential.credential.verified.v1`, `credential.credential.expired.v1`, `credential.eligibility.changed.v1`, `credential.worker.blocked.v1` |
| Primary store       | Aurora PostgreSQL + S3 (document storage)                                                                                                    |
| Deterministic rules | Expiry blocking, OIG/SAM exclusion, facility requirement matching — NEVER AI                                                                 |
| Aggregate root      | WorkerCredential                                                                                                                             |
| Status lifecycle    | `REQUIRED → REQUESTED → RECEIVED → EXTRACTED → UNDER_REVIEW → VERIFIED → ACTIVE → EXPIRING → EXPIRED`                                        |

#### ONBOARDING (deferred — post-golden-path)

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Owning service | `workforce-service` (onboarding module)            |
| Entities       | OnboardingChecklist, ChecklistItem, FormSubmission |
| Build phase    | H2                                                 |

---

### 3.3 Operations Layer

#### CLIENT & FACILITY

| Attribute        | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Owning service   | `staffing-service` (client module)                                           |
| Entities         | Client, ClientGroup, Facility, Department, Unit, CostCenter, FacilityContact |
| Commands         | CreateClient, CreateFacility, ConfigureDepartment, SetCredentialRequirements |
| Events published | `client.facility.created.v1`, `client.requirements.updated.v1`               |
| Primary store    | Aurora PostgreSQL                                                            |
| Aggregate root   | Facility                                                                     |

#### SCHEDULE & ASSIGNMENT

| Attribute           | Value                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owning service      | `staffing-service` (schedule module)                                                                                                                        |
| Entities            | Shift, ShiftOffer, ShiftRequest, Assignment, Cancellation                                                                                                   |
| Commands            | CreateShift, PublishShift, OfferShift, RequestShift, ConfirmAssignment, CancelShift, ReportNoShow                                                           |
| Events published    | `schedule.shift.created.v1`, `schedule.shift.published.v1`, `schedule.assignment.confirmed.v1`, `schedule.shift.canceled.v1`, `schedule.noshow.reported.v1` |
| Primary store       | Aurora PostgreSQL                                                                                                                                           |
| Aggregate root      | Shift                                                                                                                                                       |
| Status lifecycle    | See `golden-path-state-machines.md`                                                                                                                         |
| Deterministic rules | Credential eligibility check, scheduling conflict detection, overtime threshold — NEVER AI                                                                  |

#### RECRUIT (deferred — H3)

| Attribute      | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Owning service | `staffing-service` (recruit module)                       |
| Entities       | Job, Application, Submission, Interview, Offer, Placement |
| Build phase    | H3 (replaces Bullhorn)                                    |

#### ENGAGE (deferred — H3)

| Attribute      | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Owning service | `staffing-service` (engage module)                           |
| Entities       | Campaign, Sequence, CommunicationPreference, EngagementScore |
| Build phase    | H3                                                           |

---

### 3.4 Financial Layer

#### TIME & TIMECARD

| Attribute           | Value                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Owning service      | `time-finance-service` (time module)                                                                                 |
| Entities            | ClockEvent, Break, GeofenceEvidence, Timecard, TimecardException, TimecardApproval                                   |
| Commands            | RecordClockIn, RecordClockOut, RecordBreak, GenerateTimecard, ApproveTimecard, FlagException, ResolveException       |
| Events published    | `time.clock.recorded.v1`, `time.timecard.generated.v1`, `time.timecard.approved.v1`, `time.exception.flagged.v1`     |
| Primary store       | Aurora PostgreSQL (initially; DynamoDB for clock events deferred per ADR-005)                                        |
| Aggregate root      | Timecard                                                                                                             |
| Status lifecycle    | `OPEN → SUBMITTED → VALIDATING → CLIENT_APPROVAL_PENDING → APPROVED → PAYROLL_READY → EXPORTED → PROCESSED → CLOSED` |
| Deterministic rules | Hour calculation, break compliance, geofence validation, overtime detection — NEVER AI                               |

#### PAYROLL PREP

| Attribute            | Value                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Owning service       | `time-finance-service` (payroll module)                                                           |
| Entities             | PayRule, EarningsCalculation, PayrollBatch, PayrollExport                                         |
| Commands             | CalculateEarnings, CreatePayrollBatch, ExportToProvider, RecordReconciliation                     |
| Events published     | `payroll.earnings.calculated.v1`, `payroll.batch.exported.v1`                                     |
| Primary store        | Aurora PostgreSQL                                                                                 |
| Deterministic rules  | ALL pay calculations (OT, differentials, holiday, guaranteed hours, mileage, stipends) — NEVER AI |
| External integration | Paycom (export-only, remains payroll processor)                                                   |
| Scope boundary       | Prep and export only. No tax calculation, withholding, filing, or remittance                      |

#### BILLING

| Attribute            | Value                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| Owning service       | `time-finance-service` (billing module)                                            |
| Entities             | BillRule, BillingCalculation, Invoice, BillingBatch                                |
| Commands             | CalculateBilling, GenerateInvoice, ExportToERP                                     |
| Events published     | `billing.invoice.generated.v1`, `billing.batch.exported.v1`                        |
| Primary store        | Aurora PostgreSQL                                                                  |
| External integration | NetSuite (export-only, remains financial ledger)                                   |
| Scope boundary       | Calculation and export. No general ledger, AP/AR management, or payment processing |

---

### 3.5 Migration Layer (Temporary — All Retirement-Tracked)

#### SYMPLR ADAPTER

| Attribute            | Value                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| Purpose              | Read worker/credential/shift/timecard data from Symplr replicated database |
| Direction            | Inbound read (CareCareer reads Symplr) + shadow comparison                 |
| Retirement condition | workforce-service and staffing-service proven as SoR for covered workloads |
| Data access          | Symplr CTM replicated PostgreSQL database                                  |

#### BULLHORN ADAPTER

| Attribute            | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Purpose              | Read candidate/job/submission data for recruiting migration |
| Direction            | Inbound read + eventual backfill                            |
| Retirement condition | recruit module proven as SoR for covered teams              |
| Build phase          | H3                                                          |

#### MAESTRA ADAPTER

| Attribute            | Value                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| Purpose              | Read existing Maestra shift/timecard/identity-mapping data for reconciliation |
| Direction            | Read-only for comparison and reconciliation                                   |
| Retirement condition | Golden-path pilot passes reconciliation thresholds                            |

---

## 4. Communication Patterns

### 4.1 Synchronous (REST)

Used when the caller needs an immediate result:

```
identity-service ← all services (permission evaluation)
platform-service ← all services (tenant context, entitlement check)
workforce-service ← staffing-service (eligibility check before assignment)
workforce-service ← time-finance-service (worker validation)
staffing-service ← time-finance-service (shift/assignment lookup for timecard)
```

### 4.2 Asynchronous (Domain Events via Outbox → SQS/EventBridge)

Used for propagation and eventual consistency:

```
schedule.assignment.confirmed.v1 → time-finance-service (prepare timecard)
schedule.assignment.confirmed.v1 → notification (send confirmation)
time.timecard.approved.v1 → payroll-prep (calculate earnings)
credential.credential.expired.v1 → staffing-service (cancel affected shifts)
credential.eligibility.changed.v1 → staffing-service (re-evaluate assignments)
worker.availability.updated.v1 → staffing-service (update matching pool)
tenant.entitlement.changed.v1 → all services (enable/disable modules)
```

### 4.3 Anti-Corruption Layer (Migration Adapters)

```
workforce-service ──reads──→ symplr-adapter ──reads──→ Symplr replicated DB
staffing-service ──compares──→ maestra-adapter ──reads──→ Maestra PostgreSQL
time-finance-service ──compares──→ maestra-adapter ──reads──→ Maestra timecard data
```

These adapters are unidirectional reads. CareCareer never writes to legacy systems.

---

## 5. Golden-Path Context Participation

The first business release (per-diem shift lifecycle) involves these contexts:

| Context                  | Golden-Path Role                                   |
| ------------------------ | -------------------------------------------------- |
| Tenant & Entitlement     | Tenant provisioning, config                        |
| Identity & Authorization | User access, permissions                           |
| Audit                    | Every mutation recorded                            |
| Client & Facility        | Facility/department setup, credential requirements |
| Worker                   | Worker profile, availability                       |
| Credential & Compliance  | Eligibility evaluation, blocking                   |
| Schedule & Assignment    | Shift lifecycle (core of golden path)              |
| Time & Timecard          | Clock events, timecard generation, approval        |
| Payroll Prep             | Earnings calculation, export-ready                 |
| Billing                  | Bill calculation, invoice-ready                    |
| Symplr Adapter           | Shadow comparison source                           |
| Maestra Adapter          | Reconciliation source                              |

---

## 6. Deployment Units (Initial)

For the golden-path release, these bounded contexts are grouped into deployable services:

| Deployable Service     | Contexts                                  | Rationale                                                     |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `platform-service`     | Tenant, Entitlement, Audit, Policy/Config | Shared infrastructure, low change frequency                   |
| `identity-service`     | Identity, Authorization                   | Security boundary, independent scaling                        |
| `workforce-service`    | Worker, Credential, Onboarding            | Cohesive lifecycle, credential checks are hot-path for worker |
| `staffing-service`     | Client, Facility, Schedule, Assignment    | Cohesive demand-supply matching                               |
| `time-finance-service` | Time, Timecard, Payroll Prep, Billing     | Linear pipeline, transactional integrity                      |

Later extraction candidates (when scale or ownership justifies):

- Credential → separate service (high verification volume)
- Notification → separate service (multi-channel complexity)
- Recruit → separate service (H3, different team)
- AI Platform → separate service (H2+, different runtime)

---

## 7. Rules

1. A bounded context MUST have exclusive write ownership of its entities.
2. Cross-context data access MUST use versioned APIs or domain events — never direct DB queries.
3. Every entity MUST have one named source of truth per lifecycle stage.
4. External system IDs are stored as `ExternalReference` — never as primary keys.
5. Migration adapters are read-only and retirement-tracked.
6. Deterministic business rules (pay, bill, credential, eligibility, state transitions) are ALWAYS code — never AI output.
7. AI agents access business capabilities through service APIs with full tenant, actor, and audit context.
