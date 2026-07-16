# CareCareer — Legacy System Map

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Purpose

This document maps the existing Maestra platform services, their responsibilities, integrations, and how each relates to the CareCareer replacement architecture. Every existing component has a clear disposition: retain, bridge, replace, or retire.

---

## 2. Current System Landscape

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CURRENT MAESTRA ECOSYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  EXTERNAL LICENSED PLATFORMS                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │   SYMPLR CTM  │  │   BULLHORN    │  │  LABOR EDGE   │  │   NETSUITE    │   │
│  │ (Scheduling,  │  │  (ATS, CRM,   │  │  (Travel VMS, │  │  (ERP, GL,    │   │
│  │  Credentialing│  │   Candidates, │  │   Workforce   │  │   Billing,    │   │
│  │  Time, Workers│  │   Jobs, Notes)│  │   Portal)     │  │   Invoicing)  │   │
│  │  Compliance)  │  │               │  │               │  │               │   │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘   │
│          │                   │                   │                   │           │
│──────────┼───────────────────┼───────────────────┼───────────────────┼───────────│
│          │                   │                   │                   │           │
│  MAESTRA APPLICATION SERVICES (EKS)                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                       │
│  │  Caregiver    │  │   Facility    │  │   Timecard    │                       │
│  │  Backend      │  │   Gateway     │  │   Service     │                       │
│  │  (Go/TS)     │  │   (Go/TS)     │  │   (Go/TS)     │                       │
│  └───────────────┘  └───────────────┘  └───────────────┘                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                       │
│  │  Candidate    │  │   Internal    │  │   Identity    │                       │
│  │  Portal       │  │   Records     │  │   Mapping     │                       │
│  │  (React)      │  │   Service     │  │   Service     │                       │
│  └───────────────┘  └───────────────┘  └───────────────┘                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                       │
│  │  Data Sync    │  │  Event Hook   │  │  Notification │                       │
│  │  (Kafka)      │  │  Dispatcher   │  │  Workers      │                       │
│  └───────────────┘  └───────────────┘  └───────────────┘                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │  Admin        │  │  Client       │  │  Reporting    │  │  Analytics    │   │
│  │  Dashboard    │  │  Portal       │  │  Service      │  │  Service      │   │
│  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘   │
│                                                                                   │
│  LAMBDA FUNCTIONS (11)                                                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │ Bullhorn webhook handlers, Symplr event processors, timecard calculators, │   │
│  │ notification dispatchers, scheduled sync jobs, data transformation,       │   │
│  │ report generators, integration health monitors                            │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  MOBILE APPLICATION                                                              │
│  ┌───────────────┐                                                              │
│  │ React Native  │ (Apple App Store + Google Play)                              │
│  │ - Shift view  │                                                              │
│  │ - Clock in/out│                                                              │
│  │ - Schedule    │                                                              │
│  │ - Push notif  │                                                              │
│  └───────────────┘                                                              │
│                                                                                   │
│  DATA STORES                                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                       │
│  │  PostgreSQL   │  │  Azure SQL    │  │  Redis        │                       │
│  │  (primary)    │  │  (legacy/     │  │  (cache)      │                       │
│  │               │  │   reporting)  │  │               │                       │
│  └───────────────┘  └───────────────┘  └───────────────┘                       │
│                                                                                   │
│  MESSAGING                                                                       │
│  ┌───────────────┐                                                              │
│  │  Kafka        │ (Bullhorn sync, Symplr sync, timecard events,                │
│  │               │  identity mapping, bidirectional data sync)                   │
│  └───────────────┘                                                              │
│                                                                                   │
│  EXTERNAL SERVICES                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  Auth0   │ │ SendGrid │ │  Google  │ │  Paycom  │ │ HubSpot  │            │
│  │  (IdP)   │ │ (email)  │ │  Maps    │ │ (payroll)│ │  (CRM)   │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                                   │
│  INFRASTRUCTURE                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  EKS     │ │Terraform │ │  Helm    │ │  GitHub  │ │  ECR     │            │
│  │ (multi-  │ │ (IaC)    │ │ (deploy) │ │ Actions  │ │(registry)│            │
│  │  AZ)     │ │          │ │          │ │  (CI/CD) │ │          │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Service Inventory and Disposition

### 3.1 EKS Application Services

| #   | Current Service          | Language | Responsibility                                                | Disposition            | CareCareer Replacement                              | Notes                                                       |
| --- | ------------------------ | -------- | ------------------------------------------------------------- | ---------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Caregiver Backend        | Go/TS    | Worker profiles, shift requests, schedule view, push handling | **Replace**            | `workforce-service` + `staffing-service`            | Core golden-path replacement target                         |
| 2   | Facility Gateway         | Go/TS    | Client/facility data, department config, requirement lookups  | **Replace**            | `staffing-service` (client module)                  | Seed data from this service                                 |
| 3   | Timecard Service         | Go/TS    | Timecard generation, calculation, approval routing            | **Replace**            | `time-finance-service`                              | Primary reconciliation target                               |
| 4   | Candidate Portal         | React    | Worker-facing web application                                 | **Replace**            | `worker-portal` (Next.js)                           | New UX, same workflows                                      |
| 5   | Internal Records Service | Go/TS    | Local data cache, identity mapping between Bullhorn/Symplr    | **Bridge then retire** | `migration/` adapters + `external_references` table | Identity mapping logic migrates to canonical ID model       |
| 6   | Identity Mapping Service | Go/TS    | Bidirectional ID mapping (Bullhorn ↔ Symplr ↔ Maestra)      | **Replace**            | `external_references` table in each service         | Complexity moves to data model, not a service               |
| 7   | Data Sync (Kafka)        | Go/TS    | Kafka consumers/producers for Bullhorn and Symplr sync        | **Bridge then retire** | CareCareer event outbox + migration adapters        | Kafka topics remain for legacy; new services use outbox+SQS |
| 8   | Event Hook Dispatcher    | Go/TS    | Webhook delivery, event routing                               | **Replace**            | `platform-service` (notification/event module)      | New event infrastructure                                    |
| 9   | Notification Workers     | Go/TS    | Email, SMS, push notification delivery                        | **Replace**            | Notification module within services (initially)     | Extract to separate service in H2 if needed                 |
| 10  | Admin Dashboard          | React    | Internal operations UI                                        | **Replace**            | `admin-portal` (Next.js)                            | New UX with full RBAC                                       |
| 11  | Client Portal            | React    | Client-facing UI (shifts, timecards, approvals)               | **Replace**            | `client-portal` (Next.js)                           | New UX, self-service                                        |
| 12  | Reporting Service        | Go/TS    | Report generation, data aggregation                           | **Defer**              | `analytics-service` (H5+)                           | Not in golden path                                          |
| 13  | Analytics Service        | Go/TS    | Metrics, dashboards, operational intelligence                 | **Defer**              | `analytics-service` (H5+)                           | Not in golden path                                          |

### 3.2 Lambda Functions

| #   | Function Purpose                     | Disposition            | CareCareer Replacement                      | Notes                                               |
| --- | ------------------------------------ | ---------------------- | ------------------------------------------- | --------------------------------------------------- |
| 1   | Bullhorn webhook handler             | **Bridge**             | `migration/connectors/bullhorn/` adapter    | Remains active until H3 Bullhorn retirement         |
| 2   | Symplr event processor               | **Bridge**             | `migration/connectors/symplr/` adapter      | Remains active until H2 Symplr cutover per workload |
| 3   | Timecard calculator                  | **Replace**            | `time-finance-service` deterministic engine | Golden-path replacement target                      |
| 4   | Notification dispatcher (email)      | **Replace**            | Notification module                         | Standard notification channel                       |
| 5   | Notification dispatcher (SMS)        | **Replace**            | Notification module                         | Standard notification channel                       |
| 6   | Notification dispatcher (push)       | **Replace**            | Notification module                         | Standard notification channel                       |
| 7   | Scheduled sync (Bullhorn → Maestra)  | **Bridge**             | Migration adapter                           | Keeps Maestra cache current during coexistence      |
| 8   | Scheduled sync (Symplr → Maestra)    | **Bridge**             | Migration adapter                           | Keeps Maestra cache current during coexistence      |
| 9   | Data transformation (payroll export) | **Replace**            | `time-finance-service` payroll export       | Golden-path target                                  |
| 10  | Report generator                     | **Defer**              | Analytics (H5)                              | Not in golden path                                  |
| 11  | Integration health monitor           | **Retain temporarily** | Platform observability                      | Replace with OpenTelemetry health checks            |

### 3.3 Mobile Application

| Component               | Disposition | CareCareer Replacement                       | Notes                                                   |
| ----------------------- | ----------- | -------------------------------------------- | ------------------------------------------------------- |
| React Native app (Expo) | **Replace** | New `caregiver-mobile` (React Native + Expo) | Same tech, new UX, offline-first clock, CareCareer APIs |
| App Store presence      | **Retain**  | Same app store listings, updated binary      | Seamless transition for workers                         |
| Push notification infra | **Replace** | CareCareer notification service              | Re-register device tokens                               |

### 3.4 Data Stores

| Store                | Current Use                                               | Disposition | CareCareer Equivalent            | Migration                                              |
| -------------------- | --------------------------------------------------------- | ----------- | -------------------------------- | ------------------------------------------------------ |
| PostgreSQL (primary) | Worker cache, shifts, timecards, identity mapping, config | **Replace** | Aurora PostgreSQL with RLS       | ETL seed for pilot data; coexistence during transition |
| Azure SQL            | Legacy reporting, historical data                         | **Archive** | S3 data lake + Athena (H5)       | Read-only access for historical queries; no new writes |
| Redis                | Session cache, rate limiting                              | **Replace** | ElastiCache Redis (new instance) | No data migration needed (ephemeral)                   |

### 3.5 Messaging

| Component     | Current Use                                                   | Disposition | CareCareer Equivalent                                                            | Notes                                                                        |
| ------------- | ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Kafka cluster | Bullhorn sync, Symplr sync, timecard events, identity mapping | **Bridge**  | Migration adapters consume from Kafka; new services use outbox + SQS/EventBridge | Kafka remains for legacy integration only; no new CareCareer topics on Kafka |

---

## 4. Integration Map

### 4.1 Current Integration Flows

```
Bullhorn ──webhook──→ Lambda ──→ Kafka ──→ Identity Mapping ──→ Maestra PostgreSQL
                                                              ──→ Symplr (via API)

Symplr ──events──→ Lambda ──→ Kafka ──→ Maestra PostgreSQL
                                       ──→ Timecard Service
                                       ──→ Notification Workers

Maestra Mobile ──API──→ Caregiver Backend ──→ Symplr APIs (shift, clock)
                                           ──→ Maestra PostgreSQL (cache)

Client Portal ──API──→ Facility Gateway ──→ Symplr APIs
                                         ──→ Maestra PostgreSQL

Timecard Service ──→ Symplr (timecard data)
                 ──→ Paycom (payroll export)
                 ──→ NetSuite (invoice data)

HubSpot ──→ Bullhorn (marketing → recruiting pipeline)
```

### 4.2 CareCareer Integration Architecture (Target)

```
OIDC Provider (Auth0/Cognito) ──token──→ identity-service (mapping + authz)

Worker Mobile ──API──→ staffing-service (shifts, requests)
                    ──→ time-finance-service (clock)
                    ──→ workforce-service (profile, credentials)

Client Portal ──API──→ staffing-service (shifts, approvals)
                    ──→ time-finance-service (timecard approval)

Admin Portal ──API──→ platform-service (tenants, config)
                   ──→ identity-service (users, roles)
                   ──→ all services (operational views)

Services ──outbox──→ EventBridge/SQS ──→ consuming services
                                      ──→ notification delivery
                                      ──→ audit recording

Migration Adapters ──read──→ Symplr replicated DB (comparison source)
                   ──read──→ Maestra PostgreSQL (reconciliation)
                   ──read──→ Kafka topics (legacy event consumption)

time-finance-service ──export──→ Paycom (payroll-ready batch)
                     ──export──→ NetSuite (invoice-ready batch)
```

---

## 5. Symplr CTM Integration Detail

Symplr CTM is the most complex legacy dependency. It currently owns:

### 5.1 Symplr Data Domains

| Domain             | Tables/Entities                                     | CareCareer Replacement                 | Migration Approach                        |
| ------------------ | --------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| Workers/Caregivers | person, caregiver, demographics, contact            | `workforce-service` Worker entity      | ETL seed from replicated DB               |
| Credentials        | credential, credential_type, document, verification | `workforce-service` Credential entity  | ETL seed + document migration to S3       |
| Compliance         | requirement, requirement_matrix, compliance_status  | `workforce-service` eligibility engine | Rebuild as deterministic rules; reconcile |
| Scheduling         | shift, assignment, offer, schedule                  | `staffing-service` Shift/Assignment    | Shadow + new pilot shifts                 |
| Time & Attendance  | clock_event, timecard, break, exception             | `time-finance-service` Clock/Timecard  | Parallel capture for pilot                |
| Pay Rules          | pay_rule, rate, differential, overtime_config       | `time-finance-service` PayRule         | Manual config + validation                |
| Bill Rules         | bill_rule, markup, fee_schedule                     | `time-finance-service` BillRule        | Manual config + validation                |
| Facilities         | facility, department, unit, cost_center             | `staffing-service` Facility entity     | ETL seed                                  |
| Clients            | client, client_group, contact                       | `staffing-service` Client entity       | ETL seed                                  |

### 5.2 Symplr Replicated Database

The Symplr CTM replicated database (documented in `CTM Replicated Database Technical Specifications_12_22.pdf`) provides read access to Symplr data without impacting their production system.

**CareCareer uses this for:**

- Initial data seeding (workers, facilities, credentials, requirements)
- Shadow comparison during pilot (eligibility decisions, timecard hours)
- Reconciliation during cutover

**CareCareer does NOT use this for:**

- Real-time operational queries (too slow, not guaranteed fresh)
- Writing back to Symplr (read-only)
- Primary source of truth after cutover

---

## 6. Bullhorn Integration Detail

Bullhorn currently owns recruiting/CRM data:

| Domain         | Bullhorn Entity                  | CareCareer Replacement                | Build Phase                                           |
| -------------- | -------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Candidates     | Candidate                        | `workforce-service` Worker (pre-hire) | H3                                                    |
| Jobs           | JobOrder                         | `staffing-service` Job entity         | H3                                                    |
| Submissions    | Submission                       | `staffing-service` Submission entity  | H3                                                    |
| Placements     | Placement                        | `staffing-service` Placement entity   | H3                                                    |
| Notes/Activity | Note, Activity                   | `staffing-service` activity timeline  | H3                                                    |
| Client CRM     | ClientCorporation, ClientContact | `staffing-service` Client entity      | H1 (seeded from Symplr; Bullhorn adds CRM data in H3) |

**Bullhorn is NOT touched during the golden path (H1).** It remains operational for recruiting teams until H3.

---

## 7. Infrastructure Reuse

### 7.1 What CareCareer Reuses From Maestra Infrastructure

| Asset                  | Reuse Strategy                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| AWS accounts           | Deploy CareCareer services in same or sibling accounts               |
| EKS cluster            | Deploy new services on existing cluster (per ADR-001) OR new cluster |
| Terraform modules      | Extend existing modules for new services                             |
| Helm chart patterns    | New charts following existing conventions                            |
| GitHub Actions         | New workflows using established patterns                             |
| ECR                    | New repositories in same registry                                    |
| Branch protection      | Same rules apply to CareCareer repos                                 |
| Monitoring stack       | Extend existing dashboards and alerting                              |
| VPC / Networking       | Deploy in existing VPC with appropriate security groups              |
| Certificate management | Use existing cert-manager setup                                      |
| Secret management      | Use existing Secrets Manager patterns                                |

### 7.2 What CareCareer Introduces New

| New Component                   | Reason                                                   |
| ------------------------------- | -------------------------------------------------------- |
| Aurora PostgreSQL (RLS-enabled) | Multi-tenant isolation not present in current PostgreSQL |
| EventBridge + SQS               | Durable event backbone (Kafka stays for legacy only)     |
| OpenTelemetry                   | Unified observability (replaces ad-hoc logging)          |
| Service mesh / mTLS (if needed) | Zero-trust between services                              |
| Feature flag system             | Tenant-scoped feature management                         |

---

## 8. Kafka Topic Disposition

| Current Topic                 | Purpose                              | Disposition                                | CareCareer Equivalent                          |
| ----------------------------- | ------------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| `bullhorn.candidate.events`   | Candidate changes from Bullhorn      | **Bridge** (until H3)                      | Migration adapter consumes                     |
| `bullhorn.job.events`         | Job order changes from Bullhorn      | **Bridge** (until H3)                      | Migration adapter consumes                     |
| `symplr.caregiver.events`     | Worker changes from Symplr           | **Bridge** (until H2 cutover)              | Migration adapter consumes                     |
| `symplr.shift.events`         | Shift/assignment changes from Symplr | **Bridge** (until H2 cutover)              | Migration adapter consumes                     |
| `symplr.timecard.events`      | Timecard events from Symplr          | **Bridge** (until H2 cutover)              | Shadow comparison source                       |
| `maestra.identity.sync`       | ID mapping between systems           | **Retire** after canonical IDs established | `external_references` table                    |
| `maestra.notification.events` | Notification triggers                | **Replace**                                | CareCareer domain events → notification module |

**Rule: No new CareCareer service publishes to or consumes from Kafka. Legacy Kafka is consumed only by migration adapters under `migration/`.**

---

## 9. Operational Continuity During Build

### 9.1 What Must Keep Running

| System                | Why                                            | CareCareer Impact                                |
| --------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Symplr CTM            | All production scheduling, credentialing, time | None — CareCareer runs in shadow                 |
| Bullhorn              | All recruiting activity                        | None until H3                                    |
| Maestra mobile app    | Workers clock in/out, view shifts              | Continues until CareCareer mobile ready          |
| Maestra client portal | Clients approve timecards                      | Continues until CareCareer client portal ready   |
| Paycom integration    | Workers get paid                               | Continues; CareCareer produces compatible export |
| NetSuite integration  | Clients get invoiced                           | Continues; CareCareer produces compatible export |
| Kafka sync            | Systems stay in sync                           | Continues; migration adapters consume            |

### 9.2 Risk Mitigation

- CareCareer development MUST NOT destabilize Maestra production
- CareCareer services deploy to separate namespace/node group within the same cluster (or separate cluster)
- No shared database connections between Maestra and CareCareer (CareCareer reads only from replicated DB)
- Feature flags control pilot scope (which workers, facilities, regions)
- Rollback from CareCareer to Maestra/Symplr is always available during pilot

---

## 10. Retirement Sequence

| System                                | Retirement Phase | Condition                                                   | Estimated Date    |
| ------------------------------------- | ---------------- | ----------------------------------------------------------- | ----------------- |
| Maestra Identity Mapping Service      | H1               | Canonical IDs established, external_references table active | Jan 2027          |
| Maestra Data Sync (Kafka)             | H2               | CareCareer events replace sync topics for pilot workloads   | Apr 2027          |
| Symplr scheduling (pilot region)      | H2               | Golden path validated for pilot region                      | Apr 2027          |
| Symplr time/attendance (pilot region) | H2               | Timecard reconciliation passes for pilot                    | Apr 2027          |
| Maestra Timecard Service              | H2               | `time-finance-service` handles pilot timecards              | Apr 2027          |
| Maestra Caregiver Backend             | H2               | Pilot workers use CareCareer APIs                           | Apr 2027          |
| Maestra Facility Gateway              | H2               | Pilot facilities managed in CareCareer                      | Apr 2027          |
| Maestra Candidate Portal              | H2               | Worker portal operational for pilot                         | Apr 2027          |
| Bullhorn (pilot teams)                | H3               | Recruit module proven for pilot teams                       | Jul 2027          |
| Symplr credentialing (pilot)          | H2               | Credential engine reconciled for pilot                      | Apr 2027          |
| Maestra Client Portal                 | H2               | Client portal operational for pilot                         | Apr 2027          |
| Remaining Maestra services            | H4-H5            | All workloads migrated                                      | Oct 2027–Jan 2028 |
| Symplr full retirement                | H5               | All tenants/regions on CareCareer                           | Jan 2028          |
| Bullhorn full retirement              | H5               | All recruiting teams on CareCareer                          | Jan 2028          |
| Kafka cluster                         | H5               | No remaining consumers                                      | Jan 2028          |
