# CareCareer — Migration Map

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Purpose

This document defines the migration path from the current Maestra/Symplr/Bullhorn
ecosystem to native CareCareer ownership. Every current service, dataset, and
integration has an explicit disposition, migration pattern, write-authority rule,
cutover gate, and rollback path.

Retirement dates are **planning targets**, not commitments. Actual retirement is
governed by cutover gates and reconciliation evidence.

---

## 2. Migration Waves

### Wave 0 — Observe and Map

**Objective:** Establish read access and baseline understanding without any
production ownership changes.

Activities:

- Read-only access to Symplr replicated database
- Schema and value mapping (Symplr → CareCareer canonical model)
- Existing API behavior analysis (request/response capture)
- External-ID reconciliation (Symplr ↔ Bullhorn ↔ Maestra mappings)
- Operational baseline capture (volumes, patterns, error rates)
- No production ownership changes

**Risk:** Symplr replicated database access depends on vendor-managed replication
configuration. Access availability and freshness must be confirmed before Wave 1.

**Exit gate:** Schema mapping complete, volume estimates validated, access confirmed.

### Wave 1 — Shadow

**Objective:** CareCareer receives or derives copies of production data and
calculates results without affecting production workflows.

Shadow data:

- Facilities, departments, units, cost centers
- Workers, demographics, preferences, availability
- Credentials, requirements, compliance status
- Shifts, assignments, offers
- Clock events, breaks, geofence evidence
- Timecards, exceptions, approvals
- Pay rules, bill rules, rate configurations
- Pay and bill calculation inputs

CareCareer actions:

- Seed reference data (facilities, requirements, pay/bill rules)
- Replicate active worker/credential records for pilot scope
- Shadow-calculate eligibility decisions
- Shadow-calculate timecard hours
- Shadow-calculate pay and bill amounts
- Compare all outputs against Symplr/Maestra results
- Produce reconciliation reports

**Write authority:** Legacy systems remain sole authoritative writer.
CareCareer writes only to its own shadow tables.

**Exit gate:** Reconciliation metrics stable for 14 consecutive days.

### Wave 2 — Controlled Pilot Ownership

**Objective:** CareCareer owns newly created pilot records for a controlled scope.

Pilot scope:

- One tenant (single staffing agency or controlled business unit)
- One branch or operating team
- Selected facilities (5-10 for initial pilot)
- Selected workers (100-500 in pilot region)
- Limited shift types (per-diem only; no travel, no contracts)

CareCareer owns:

- New shift creation for pilot facilities
- Shift offers and worker requests for pilot scope
- Assignment confirmation for pilot shifts
- Clock in/out for pilot assignments
- Timecard generation for pilot shifts
- Pay/bill calculation for pilot timecards

Legacy systems receive:

- Synchronized copies where operationally necessary (e.g., Symplr needs
  assignment records for payroll export until Wave 3)
- Reconciliation data for comparison

**Write authority:** CareCareer is authoritative writer for new pilot records.
Legacy systems receive propagated copies (read-only from their perspective).

**Exit gate:** Pilot operates without manual intervention for 30 days.
Reconciliation thresholds met. Operations team sign-off.

### Wave 3 — Domain Cutover

**Objective:** CareCareer becomes system of record for pilot domains.
Each domain cuts over independently.

Cutover sequence (each independent):

| Order | Domain                         | Depends On                             |
| ----- | ------------------------------ | -------------------------------------- |
| 1     | Credential eligibility         | Worker and facility data seeded        |
| 2     | Shift creation and marketplace | Eligibility engine operational         |
| 3     | Assignment lifecycle           | Shift marketplace proven               |
| 4     | Clock events and timecards     | Assignments flowing through CareCareer |
| 5     | Pay/bill preparation           | Timecards approved through CareCareer  |
| 6     | Recruiting (H3, later)         | Worker identity established            |

After cutover per domain:

- CareCareer is the sole authoritative writer
- Legacy system stops receiving new writes for that domain/scope
- Historical data remains in legacy (read-only archive access)
- Paycom/NetSuite exports produced by CareCareer

**Write authority:** CareCareer is sole writer. Legacy is archive-only.

**Exit gate per domain:** Reconciliation thresholds met for 30 consecutive days.
Finance sign-off (for pay/bill). Operations sign-off. Rollback tested.

### Wave 4 — Retirement

**Objective:** Decommission legacy components after controlled transition.

Retirement requires ALL of the following:

- Parallel-run period completes (minimum 30 days post-cutover)
- Reconciliation thresholds pass for entire period
- Operational and finance sign-off recorded
- Rollback window expires (14 days post-sign-off)
- Historical data access preserved (archive or read adapter)
- All integration consumers confirmed removed or redirected
- No remaining scheduled jobs writing to retired system
- Monitoring confirms zero traffic to retired endpoints

Retirement is per-component, per-scope. A system is fully retired only when
ALL scopes (tenants, regions, workloads) have completed Wave 3.

---

## 3. Primary Migration Matrix

### 3.1 Scheduling & Shift Management

| Field                         | Value                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Business capability           | Per-diem shift scheduling, marketplace, assignment                                    |
| Current service/system        | Symplr CTM scheduling module + Maestra Caregiver Backend                              |
| Current system of record      | Symplr CTM                                                                            |
| CareCareer target context     | Schedule & Assignment                                                                 |
| Target deployable service     | `staffing-service`                                                                    |
| Migration pattern             | Shadow → pilot ownership → strangler cutover                                          |
| Read path during coexistence  | Dual-read (CareCareer for pilot shifts; Symplr for non-pilot)                         |
| Write path during coexistence | CareCareer-first for pilot scope; Symplr for non-pilot                                |
| Data synchronization          | Symplr replicated DB (read); outbox event for downstream                              |
| Reconciliation method         | Shift count comparison, lifecycle state comparison, fill rate comparison              |
| Cutover gate                  | Shift lifecycle and counts reconcile for pilot region for 30 days                     |
| Rollback method               | Route pilot facilities back to Symplr; revert mobile API target                       |
| Dependencies                  | Symplr replicated DB access, facility data seeded, credential eligibility operational |
| Earliest retirement target    | Apr 2027 (H2) for pilot region                                                        |
| Final retirement condition    | All regions/tenants on CareCareer; zero Symplr scheduling writes for 30 days          |

### 3.2 Credentialing & Compliance

| Field                         | Value                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Business capability           | Credential tracking, verification, compliance blocking, facility requirements   |
| Current service/system        | Symplr CTM credentialing module                                                 |
| Current system of record      | Symplr CTM                                                                      |
| CareCareer target context     | Credential & Compliance                                                         |
| Target deployable service     | `workforce-service`                                                             |
| Migration pattern             | Shadow evaluation → parallel decision → strangler cutover                       |
| Read path during coexistence  | Dual-read (CareCareer evaluates; Symplr remains authoritative until cutover)    |
| Write path during coexistence | Symplr-first (credential records); CareCareer shadow-evaluates                  |
| Data synchronization          | Symplr replicated DB (credential tables, requirement matrix)                    |
| Reconciliation method         | Eligibility decision comparison (allow/block must match 100%)                   |
| Cutover gate                  | Eligibility results match Symplr for 100% of tested scenarios over 30 days      |
| Rollback method               | Revert eligibility checks to Symplr API; CareCareer stops enforcement           |
| Dependencies                  | Symplr replicated DB access, requirement matrix fully mapped, document access   |
| Earliest retirement target    | Apr 2027 (H2) for pilot                                                         |
| Final retirement condition    | All credential types verified natively; all facility requirements in CareCareer |

### 3.3 Time & Attendance

| Field                         | Value                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Business capability           | Clock in/out, break tracking, geofence, timecard generation, approval                      |
| Current service/system        | Maestra Timecard Service + Symplr time module + Maestra mobile app                         |
| Current system of record      | Symplr (timecards) + Maestra (clock events from mobile)                                    |
| CareCareer target context     | Time & Timecard                                                                            |
| Target deployable service     | `time-finance-service`                                                                     |
| Migration pattern             | Parallel capture → parallel calculation → strangler cutover                                |
| Read path during coexistence  | Dual-read (both systems calculate; compare outputs)                                        |
| Write path during coexistence | CareCareer-first for pilot clock events; Symplr for non-pilot                              |
| Data synchronization          | Maestra clock events (PostgreSQL read); Symplr timecard (replicated DB)                    |
| Reconciliation method         | Hour comparison (within 1-minute tolerance), exception detection rate                      |
| Cutover gate                  | Hours and exceptions reconcile 100% for pilot over 30 days                                 |
| Rollback method               | Route mobile clock API back to Maestra; revert timecard generation to Symplr               |
| Dependencies                  | Assignment data in CareCareer, mobile app updated, geofence config migrated                |
| Earliest retirement target    | Apr 2027 (H2) for pilot                                                                    |
| Final retirement condition    | All clock events and timecards through CareCareer; Maestra timecard service decommissioned |

### 3.4 Pay & Bill Preparation

| Field                         | Value                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Business capability           | Earnings calculation, pay rules, bill rules, payroll export, invoice generation             |
| Current service/system        | Symplr pay/bill module + Lambda (payroll export) + NetSuite integration                     |
| Current system of record      | Symplr (calculations) → Paycom (payroll) → NetSuite (invoicing)                             |
| CareCareer target context     | Payroll Prep + Billing                                                                      |
| Target deployable service     | `time-finance-service`                                                                      |
| Migration pattern             | Calculation preview → parallel comparison → cutover export                                  |
| Read path during coexistence  | Dual-read (CareCareer calculates preview; Symplr produces actual export)                    |
| Write path during coexistence | Symplr-first (actual exports); CareCareer preview-only until finance sign-off               |
| Data synchronization          | Symplr pay/bill config (manual seed); approved timecards (from CareCareer)                  |
| Reconciliation method         | Per-line-item financial comparison (within $0.01); batch total comparison                   |
| Cutover gate                  | Finance signs off on deterministic comparison; 30 days of matching results                  |
| Rollback method               | Revert export source to Symplr; CareCareer stops producing Paycom/NetSuite files            |
| Dependencies                  | Pay rules fully configured, approved timecards available, Paycom format validated           |
| Earliest retirement target    | Apr 2027 (H2) for pilot per-diem                                                            |
| Final retirement condition    | Finance approves CareCareer as sole export source; Paycom/NetSuite accept CareCareer output |

### 3.5 Worker Management

| Field                         | Value                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Business capability           | Worker profiles, availability, preferences, documents, status lifecycle           |
| Current service/system        | Symplr CTM (person/caregiver) + Bullhorn (candidate) + Maestra Caregiver Backend  |
| Current system of record      | Symplr (operational worker data) + Bullhorn (recruiting/candidate data)           |
| CareCareer target context     | Worker                                                                            |
| Target deployable service     | `workforce-service`                                                               |
| Migration pattern             | Backfill + shadow → pilot write ownership                                         |
| Read path during coexistence  | CareCareer (seeded from Symplr); Symplr for non-pilot workers                     |
| Write path during coexistence | CareCareer-first for pilot workers; Symplr for non-pilot                          |
| Data synchronization          | ETL from Symplr replicated DB (initial seed); incremental sync for active records |
| Reconciliation method         | Field-by-field comparison (>99% match); status lifecycle comparison               |
| Cutover gate                  | Profile and compliance reconciliation passes for pilot population                 |
| Rollback method               | Revert worker API routing; Symplr continues as SoR                                |
| Dependencies                  | Symplr replicated DB access, identity mapping complete, Auth0 subject mapping     |
| Earliest retirement target    | Apr 2027 (H2) for pilot workers                                                   |
| Final retirement condition    | All active workers managed in CareCareer; Symplr person records archive-only      |

### 3.6 Client & Facility Management

| Field                         | Value                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| Business capability           | Client accounts, facilities, departments, contacts, credential requirements |
| Current service/system        | Symplr CTM + Maestra Facility Gateway + Bullhorn (ClientCorporation)        |
| Current system of record      | Symplr (operational) + Bullhorn (CRM/sales)                                 |
| CareCareer target context     | Client & Facility                                                           |
| Target deployable service     | `staffing-service`                                                          |
| Migration pattern             | Reference-data import → write ownership for pilot facilities                |
| Read path during coexistence  | CareCareer (seeded); Symplr for non-pilot facilities                        |
| Write path during coexistence | CareCareer-first for pilot facilities; Symplr for non-pilot                 |
| Data synchronization          | ETL from Symplr replicated DB (initial seed)                                |
| Reconciliation method         | Record count, hierarchy comparison, requirement matrix validation           |
| Cutover gate                  | Facility config, departments, and credential requirements reconcile         |
| Rollback method               | Revert facility API routing; continue using Symplr config                   |
| Dependencies                  | Symplr facility/department schema mapped, requirement matrix understood     |
| Earliest retirement target    | Jan 2027 (H1) — facilities are seeded early as reference data               |
| Final retirement condition    | All facilities managed in CareCareer; Symplr facility tables archive-only   |

### 3.7 Recruiting & ATS (H3 — Not in Golden Path)

| Field                         | Value                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Business capability           | Job orders, candidate pipeline, submissions, interviews, offers, placements     |
| Current service/system        | Bullhorn ATS/CRM + Maestra Internal Records (cache)                             |
| Current system of record      | Bullhorn                                                                        |
| CareCareer target context     | Recruit                                                                         |
| Target deployable service     | `staffing-service` (recruit module)                                             |
| Migration pattern             | Backfill historical data → coexistence sync → strangler cutover                 |
| Read path during coexistence  | Bullhorn (authoritative); CareCareer (backfilled + new)                         |
| Write path during coexistence | Bullhorn-first until team-by-team cutover                                       |
| Data synchronization          | Bullhorn REST API + webhooks (existing Kafka bridge)                            |
| Reconciliation method         | Candidate count, pipeline stage comparison, placement matching                  |
| Cutover gate                  | Recruiter productivity and conversion meet baseline for pilot teams             |
| Rollback method               | Revert team to Bullhorn workflows; CareCareer stops accepting recruiter actions |
| Dependencies                  | Bullhorn API access, historical data backfill complete, recruiter training      |
| Earliest retirement target    | Jul 2027 (H3) for pilot teams                                                   |
| Final retirement condition    | All recruiting teams on CareCareer; Bullhorn license retired                    |

---

## 4. Current Service Disposition Matrix

### 4.1 EKS Application Services

| Current Service             | Initial Disposition                                         | Target Replacement                           | Coexistence Strategy                                                                     | Retirement Wave |
| --------------------------- | ----------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| caregiver-service           | Bridge (route pilot traffic to CareCareer APIs)             | `workforce-service` + `staffing-service`     | API gateway routes pilot workers to CareCareer; non-pilot continues to caregiver-service | Wave 3 (H2)     |
| facility-gateway            | Gradually route capabilities to CareCareer                  | `staffing-service` (client module)           | Page-by-page migration; shared auth                                                      | Wave 3 (H2)     |
| timecard-service            | Reconcile with `time-finance-service`                       | `time-finance-service`                       | Parallel calculation; compare outputs                                                    | Wave 3 (H2)     |
| candidate-portal-service    | Retain until recruiting migration                           | `worker-portal` (Next.js)                    | Separate URLs; redirect after cutover                                                    | Wave 3 (H3)     |
| internal-records-service    | Preserve mappings; migrate to canonical external references | `external_references` table                  | Read-only access during migration; mapping data ETL'd                                    | Wave 2 (H1)     |
| identity-mapping-service    | Replace after OIDC and authorization migration              | `identity-service` + `external_references`   | Dual identity resolution during coexistence                                              | Wave 2 (H1)     |
| data-sync (Kafka consumers) | Retain as legacy integration connector                      | `migration/connectors/` adapters             | Kafka consumers continue; CareCareer reads results                                       | Wave 4 (H5)     |
| event-hook-dispatcher       | Retain for Kafka consumers only                             | Platform event infrastructure (outbox + SQS) | Legacy events through dispatcher; new events through outbox                              | Wave 4 (H4)     |
| notification-workers        | Replace with CareCareer notification module                 | Notification module within services          | Parallel delivery for pilot; legacy for non-pilot                                        | Wave 3 (H2)     |
| admin-portal (React)        | Replace workflow-by-workflow                                | `admin-portal` (Next.js)                     | Parallel UIs; feature-flag per workflow                                                  | Wave 3 (H2)     |
| client-portal (React)       | Replace page-by-page                                        | `client-portal` (Next.js)                    | Parallel UIs for pilot facilities                                                        | Wave 3 (H2)     |
| reporting-service           | Defer                                                       | `analytics-service` (H5)                     | Remains operational until analytics built                                                | Wave 4 (H5)     |
| analytics-service           | Defer                                                       | `analytics-service` (H5)                     | Remains operational until analytics built                                                | Wave 4 (H5)     |

### 4.2 Lambda Functions

| Current Function                     | Initial Disposition        | Target Replacement                          | Retirement Wave |
| ------------------------------------ | -------------------------- | ------------------------------------------- | --------------- |
| Bullhorn webhook handler             | Bridge (retain through H3) | `migration/connectors/bullhorn/`            | Wave 4 (H3+)    |
| Symplr event processor               | Bridge (retain through H2) | `migration/connectors/symplr/`              | Wave 3 (H2)     |
| Timecard calculator                  | Replace                    | `time-finance-service` deterministic engine | Wave 3 (H2)     |
| Notification dispatcher (email)      | Replace                    | Notification module (SendGrid/SES adapter)  | Wave 3 (H2)     |
| Notification dispatcher (SMS)        | Replace                    | Notification module (Twilio/SNS adapter)    | Wave 3 (H2)     |
| Notification dispatcher (push)       | Replace                    | Notification module (FCM/APNs adapter)      | Wave 3 (H2)     |
| Scheduled sync (Bullhorn → Maestra)  | Bridge                     | Migration adapter                           | Wave 4 (H3+)    |
| Scheduled sync (Symplr → Maestra)    | Bridge                     | Migration adapter                           | Wave 3 (H2)     |
| Data transformation (payroll export) | Replace                    | `time-finance-service` payroll export       | Wave 3 (H2)     |
| Report generator                     | Defer                      | Analytics (H5)                              | Wave 4 (H5)     |
| Integration health monitor           | Retain temporarily         | OpenTelemetry health checks                 | Wave 3 (H2)     |

### 4.3 Mobile Application

| Component                  | Initial Disposition                                   | Target Replacement               | Retirement Wave |
| -------------------------- | ----------------------------------------------------- | -------------------------------- | --------------- |
| React Native app (current) | Retain; update API endpoints for pilot                | New `caregiver-mobile` app       | Wave 3 (H2)     |
| Current API endpoints      | Bridge (proxy to CareCareer for pilot workers)        | CareCareer native APIs           | Wave 3 (H2)     |
| Push notification tokens   | Retain; re-register in CareCareer notification module | CareCareer notification delivery | Wave 2 (H1)     |

### 4.4 Data Stores

| Store              | Initial Disposition                 | Target Replacement               | Migration Method                               | Retirement Wave |
| ------------------ | ----------------------------------- | -------------------------------- | ---------------------------------------------- | --------------- |
| Maestra PostgreSQL | Read-only access for reconciliation | Aurora PostgreSQL (RLS)          | ETL seed for pilot data                        | Wave 4 (H5)     |
| Azure SQL          | Archive (read-only)                 | S3 + Athena (if needed)          | No active migration                            | Wave 4 (H5)     |
| Redis (Maestra)    | No migration needed                 | New ElastiCache Redis            | Ephemeral; no data migration                   | N/A             |
| Kafka cluster      | Bridge (legacy consumers remain)    | EventBridge + SQS (new services) | No topic migration; retire when consumers gone | Wave 4 (H5)     |

---

## 5. Data Migration Classification

Each dataset is classified by its migration method:

| Dataset                          | Classification                | Method                                      | Volume                     | Timing       |
| -------------------------------- | ----------------------------- | ------------------------------------------- | -------------------------- | ------------ |
| Tenants / Orgs / Branches        | Reference-data import         | Manual config                               | Small (1-5)                | Wave 1 start |
| Facilities / Departments / Units | Reference-data import         | ETL from Symplr replicated DB               | 10-50 pilot facilities     | Wave 1       |
| Facility credential requirements | Reference-data import         | ETL + manual validation                     | Per-facility matrix        | Wave 1       |
| Workers (pilot scope)            | Active-record backfill        | ETL from Symplr replicated DB               | 100-500 workers            | Wave 1       |
| Worker credentials (pilot)       | Active-record backfill        | ETL + document reference mapping            | 3-10 per worker            | Wave 1       |
| Credential documents (files)     | Active-record backfill        | S3 copy from Symplr document store          | PDFs/images per credential | Wave 1       |
| Pay rules                        | Reference-data import         | Manual config + validation                  | 20-50 rule sets            | Wave 1       |
| Bill rules                       | Reference-data import         | Manual config + validation                  | 20-50 rule sets            | Wave 1       |
| Users / identity mappings        | Active-record backfill        | ETL from Auth0 + Maestra mapping            | 20-100 internal users      | Wave 1       |
| Historical shifts (completed)    | Retained in legacy archive    | No migration; read-only access via adapter  | Millions of records        | Not migrated |
| Historical timecards             | Retained in legacy archive    | No migration; read-only access via adapter  | Millions of records        | Not migrated |
| Historical pay/bill records      | Retained in legacy archive    | No migration; read-only via NetSuite        | Financial history          | Not migrated |
| Bullhorn candidates              | Full historical backfill (H3) | Bullhorn REST API extraction                | Tens of thousands          | Wave 1 of H3 |
| Bullhorn jobs/placements         | Full historical backfill (H3) | Bullhorn REST API extraction                | Thousands                  | Wave 1 of H3 |
| Kafka event history              | Not migrated                  | Legacy topics remain until consumers retire | N/A                        | Not migrated |
| Maestra identity mappings        | Active-record backfill        | ETL to `external_references` table          | All active mappings        | Wave 1       |

### Classification Definitions

| Classification                 | Definition                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| **Full historical backfill**   | All historical records migrated for continuity (e.g., candidate history) |
| **Active-record backfill**     | Only currently active/relevant records migrated (e.g., active workers)   |
| **Reference-data import**      | Configuration and lookup data seeded (e.g., facilities, pay rules)       |
| **Event-forward only**         | No history migrated; CareCareer captures events from cutover onward      |
| **Retained in legacy archive** | Data stays in legacy system; accessible via read adapter                 |
| **Not migrated**               | Data is not needed in CareCareer (e.g., Kafka topic history)             |

---

## 6. Write-Authority Rules

**Fundamental rule: Every entity has exactly ONE authoritative writer at any
given migration stage. Dual-write is prohibited.**

### 6.1 Write Authority by Wave

| Entity            | Wave 0 (Observe) | Wave 1 (Shadow) | Wave 2 (Pilot)                | Wave 3 (Cutover)    | Wave 4 (Retire)     |
| ----------------- | ---------------- | --------------- | ----------------------------- | ------------------- | ------------------- |
| Tenant            | N/A              | CareCareer      | CareCareer                    | CareCareer          | CareCareer          |
| User/Role         | Auth0/Maestra    | Auth0/Maestra   | CareCareer (mapping)          | CareCareer          | CareCareer          |
| Facility          | Symplr           | Symplr          | CareCareer (pilot)            | CareCareer          | CareCareer          |
| Worker            | Symplr           | Symplr          | CareCareer (pilot workers)    | CareCareer          | CareCareer          |
| Credential        | Symplr           | Symplr          | Symplr (CareCareer evaluates) | CareCareer          | CareCareer          |
| Shift (pilot)     | Symplr           | Symplr          | CareCareer                    | CareCareer          | CareCareer          |
| Shift (non-pilot) | Symplr           | Symplr          | Symplr                        | Symplr → CareCareer | CareCareer          |
| Assignment        | Symplr           | Symplr          | CareCareer (pilot)            | CareCareer          | CareCareer          |
| Clock Event       | Maestra          | Maestra         | CareCareer (pilot)            | CareCareer          | CareCareer          |
| Timecard          | Symplr           | Symplr          | CareCareer (pilot)            | CareCareer          | CareCareer          |
| Pay Calculation   | Symplr           | Symplr          | Symplr (CareCareer previews)  | CareCareer          | CareCareer          |
| Bill Calculation  | Symplr           | Symplr          | Symplr (CareCareer previews)  | CareCareer          | CareCareer          |
| Payroll Export    | Symplr→Paycom    | Symplr→Paycom   | Symplr→Paycom                 | CareCareer→Paycom   | CareCareer→Paycom   |
| Invoice           | Symplr→NetSuite  | Symplr→NetSuite | Symplr→NetSuite               | CareCareer→NetSuite | CareCareer→NetSuite |
| Job/Candidate     | Bullhorn         | Bullhorn        | Bullhorn                      | Bullhorn (until H3) | CareCareer (H3+)    |

### 6.2 Propagation Rules (Where Both Systems Need Records)

When both systems need a record during coexistence:

1. **One system performs the authoritative write.**
2. **An outbox event or migration connector propagates the result.**
3. **Reconciliation detects drift.**
4. **The receiving system MUST NOT independently overwrite the authoritative record.**

Example during Wave 2:

```
CareCareer creates shift (authoritative) →
  outbox event →
  migration connector →
  Symplr receives copy (read-only from Symplr's perspective) →
  reconciliation confirms both records match
```

### 6.3 Conflict Resolution

If reconciliation detects a discrepancy:

1. **Alert** — reconciliation exception raised immediately
2. **Investigate** — determine which system has the correct data
3. **Correct** — fix the incorrect record (authoritative system wins)
4. **Root-cause** — identify and fix the propagation failure
5. **Never silently accept drift** — every mismatch is tracked to resolution

---

## 7. Rollback Matrix

Each migration domain has an independent rollback path:

### 7.1 Application Routing Rollback

| Component                        | Rollback Method                         | Time to Rollback | Pre-requisite                  |
| -------------------------------- | --------------------------------------- | ---------------- | ------------------------------ |
| Mobile API (pilot workers)       | API gateway route change (feature flag) | < 5 minutes      | Feature flag tested            |
| Client portal (pilot facilities) | URL redirect or feature flag            | < 5 minutes      | Legacy portal remains deployed |
| Admin portal                     | Feature flag per workflow               | < 5 minutes      | Legacy admin remains deployed  |
| Worker portal                    | DNS/route change                        | < 15 minutes     | Legacy portal remains deployed |

### 7.2 Data Ownership Rollback

| Domain                 | Rollback Method                                                              | Time to Rollback | Pre-requisite                                |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------- | -------------------------------------------- |
| Shift creation         | Re-enable Symplr as shift writer; sync in-flight CareCareer shifts to Symplr | < 2 hours        | Symplr scheduling module remains operational |
| Assignment             | Revert assignment writes to Symplr; propagate pending CareCareer assignments | < 2 hours        | Symplr assignment logic unchanged            |
| Clock events           | Route mobile clock API back to Maestra backend                               | < 15 minutes     | Maestra clock endpoints remain deployed      |
| Timecard generation    | Revert to Symplr timecard generation; re-process any gap                     | < 4 hours        | Symplr time module operational               |
| Pay/bill calculation   | Revert export source to Symplr; CareCareer stops producing files             | < 1 hour         | Symplr export pipeline unchanged             |
| Credential eligibility | Revert eligibility checks to Symplr API                                      | < 15 minutes     | Symplr eligibility endpoint unchanged        |

### 7.3 Event Publication Rollback

| Scenario                                    | Rollback Method                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| CareCareer events causing downstream issues | Disable outbox publisher (events stop); consumers fall back to Symplr data |
| Event consumers failing                     | DLQ absorbs failed events; consumer fixed and replays from DLQ             |
| Event schema incompatibility                | Roll back consumer deployment; publisher continues (backward-compatible)   |

### 7.4 Financial Export Rollback

| Export                                                                                   | Rollback Method                                                        | Time to Rollback |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- |
| Paycom payroll batch                                                                     | Revert to Symplr-produced batch; Paycom accepts from either source     | < 1 hour         |
| NetSuite invoice                                                                         | Revert to Symplr-produced invoice; NetSuite accepts from either source | < 1 hour         |
| Note: Financial rollback requires re-processing from Symplr data for the affected period |                                                                        |                  |

### 7.5 Symplr Synchronization Rollback

| Scenario                                 | Rollback Method                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| CareCareer stops propagating to Symplr   | Symplr continues from its own last-known state; manual reconciliation for gap |
| Symplr replicated DB becomes unavailable | CareCareer continues with last-seeded data; reconciliation paused             |
| Identity mapping fails                   | Revert to Maestra identity-mapping service (remains deployed)                 |

### 7.6 Rollback Decision Authority

| Severity                  | Decision Maker                     | Maximum Decision Time |
| ------------------------- | ---------------------------------- | --------------------- |
| Data integrity risk       | Engineering lead + operations lead | 15 minutes            |
| Financial accuracy risk   | Engineering lead + finance         | 30 minutes            |
| Partial workflow failure  | Engineering lead                   | 15 minutes            |
| Performance degradation   | Engineering lead                   | 30 minutes            |
| Security/compliance issue | Security lead + CTO                | Immediate             |

---

## 8. Dependencies and Risks

### 8.1 Critical Dependencies

| Dependency                         | Required For               | Risk if Unavailable                  | Mitigation                                                       |
| ---------------------------------- | -------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Symplr replicated DB access        | Wave 0-1 (all shadow work) | Cannot seed or reconcile             | Confirm access in first week; escalate immediately               |
| Symplr schema documentation        | Wave 0 (mapping)           | Incorrect field mapping              | CTM specification document available; validate against live data |
| Auth0 tenant access                | Wave 1 (identity mapping)  | Cannot map users                     | Confirm admin access; document all subjects                      |
| Maestra PostgreSQL read access     | Wave 1 (reconciliation)    | Cannot compare clock/timecard data   | Confirm read credentials; create read-only role                  |
| Maestra source code access         | Wave 0 (behavior analysis) | Cannot understand current logic      | Access confirmed at closing; ensure CI artifacts available       |
| Paycom export format specification | Wave 1 (pay/bill preview)  | Cannot validate export compatibility | Obtain from finance/operations team                              |
| NetSuite integration spec          | Wave 1 (billing preview)   | Cannot validate invoice format       | Obtain from finance/operations team                              |
| Operational SME availability       | All waves                  | Rule interpretation errors           | Name SMEs per domain before Wave 1 starts                        |
| AWS account access                 | Wave 1 (deployment)        | Cannot deploy to shared environment  | Confirm IAM access; create CareCareer namespace                  |

### 8.2 Risk Register

| Risk                                           | Probability | Impact                           | Mitigation                                                  |
| ---------------------------------------------- | ----------- | -------------------------------- | ----------------------------------------------------------- |
| Symplr replicated DB has stale data            | Medium      | Incorrect shadow comparison      | Validate freshness; establish SLA with Symplr               |
| Pay rule complexity exceeds documentation      | High        | Calculation mismatches           | Start pay-rule discovery early; use decision tables         |
| Geofence config not fully documented           | Medium      | Clock validation differences     | Extract config from Maestra; validate with ops team         |
| Worker deduplication across Symplr/Bullhorn    | High        | Identity conflicts during seed   | Build dedup tooling early; manual review for conflicts      |
| Kafka topic schema not documented              | Medium      | Migration adapter failures       | Capture live messages; reverse-engineer schemas             |
| Mobile app update delays (app store review)    | Low         | Pilot workers on old API         | Plan mobile update 2 weeks before pilot                     |
| Symplr contract restricts data replication use | Low         | Legal block on shadow comparison | Confirm contractual permissions (folder 1 in due diligence) |
| Finance team unavailable for sign-off          | Medium      | Cutover gate blocked             | Schedule finance reviews monthly starting Wave 1            |

---

## 9. Reconciliation Infrastructure

### 9.1 Reconciliation Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  CareCareer  │     │ Reconciler   │     │   Legacy     │
│  Calculation │────▶│   Service    │◀────│   Output     │
│  (shadow)    │     │              │     │  (Symplr/    │
│              │     │ Compare:     │     │   Maestra)   │
└──────────────┘     │ - Fields     │     └──────────────┘
                     │ - Totals     │
                     │ - States     │
                     │ - Counts     │
                     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │  Exception   │
                     │  Dashboard   │
                     │              │
                     │ - Mismatch % │
                     │ - Trend      │
                     │ - Root cause │
                     │ - Resolution │
                     └──────────────┘
```

### 9.2 Reconciliation Frequency

| Domain                | Frequency               | Method                         |
| --------------------- | ----------------------- | ------------------------------ |
| Eligibility decisions | Real-time (every check) | Inline comparison              |
| Shift lifecycle       | Hourly batch            | State comparison               |
| Timecard hours        | Daily batch             | Hour/minute comparison         |
| Pay calculation       | Per payroll period      | Line-item financial comparison |
| Bill calculation      | Per billing period      | Line-item financial comparison |
| Worker data           | Daily batch             | Field-by-field comparison      |

---

## 10. Success Metrics by Wave

| Wave   | Key Metric                               | Target                                      |
| ------ | ---------------------------------------- | ------------------------------------------- |
| Wave 0 | Schema mapping coverage                  | 100% of golden-path entities mapped         |
| Wave 0 | Symplr replicated DB access confirmed    | Yes/No                                      |
| Wave 0 | Operational baseline captured            | Volumes, patterns, error rates documented   |
| Wave 1 | Seed data accuracy                       | >99% field match against Symplr source      |
| Wave 1 | Shadow eligibility match rate            | 100% (zero false-allows)                    |
| Wave 1 | Shadow pay/bill match rate               | 100% (within $0.01)                         |
| Wave 1 | Reconciliation exception resolution time | < 24 hours                                  |
| Wave 2 | Pilot shifts created and completed       | Target: 100+ shifts/week                    |
| Wave 2 | Pilot worker participation               | 100+ workers actively using CareCareer      |
| Wave 2 | Zero manual interventions for happy-path | Yes/No                                      |
| Wave 2 | Exception rate vs baseline               | Equal or lower                              |
| Wave 3 | Reconciliation pass rate (30 days)       | 100% for pay/bill; 99%+ for shift lifecycle |
| Wave 3 | Rollback tested and documented           | Yes/No                                      |
| Wave 3 | Finance sign-off obtained                | Yes/No                                      |
| Wave 3 | Operations sign-off obtained             | Yes/No                                      |
| Wave 4 | Legacy service traffic                   | Zero for retired components                 |
| Wave 4 | Integration consumers redirected         | All confirmed                               |
| Wave 4 | Historical data access verified          | Read adapter functional                     |

---

## 11. Unknowns Requiring Discovery

These items are recorded as dependencies or risks rather than silently assumed:

| Unknown                                                                | Required Discovery                                   | Owner                    | Deadline         |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ | ---------------- |
| Exact Symplr replicated DB schema and freshness                        | Access and validate                                  | Engineering              | Week 1 of Wave 0 |
| Complete pay-rule catalog (all OT, differential, holiday combinations) | Finance SME interview + Symplr config export         | Engineering + Finance    | Week 2 of Wave 0 |
| Geofence configuration (radius, facilities, overrides)                 | Extract from Maestra code + ops team validation      | Engineering + Operations | Week 2 of Wave 0 |
| Maestra identity-mapping completeness (Symplr↔Bullhorn↔Auth0)        | Query internal-records-service DB                    | Engineering              | Week 1 of Wave 0 |
| Paycom export file format and field requirements                       | Finance team + Paycom documentation                  | Engineering + Finance    | Week 3 of Wave 0 |
| NetSuite invoice format and integration method                         | Finance team + NetSuite admin                        | Engineering + Finance    | Week 3 of Wave 0 |
| State-specific break and overtime rules (which states, which rules)    | Operations + legal team                              | Engineering + Operations | Week 2 of Wave 0 |
| Symplr contract terms regarding replicated data usage                  | Legal review of contract (folder 1 in due diligence) | Legal                    | Week 1 of Wave 0 |
| Current Kafka topic schemas (undocumented)                             | Capture live messages from each topic                | Engineering              | Week 2 of Wave 0 |
| Mobile app deployment process and app store credentials                | DevOps + current team handoff                        | Engineering              | Week 1 of Wave 0 |

---

## 12. Boundary Confirmation

### Systems OUTSIDE the initial replacement boundary:

| System               | Stays Because                                      | CareCareer Interaction                               |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Paycom               | Full payroll processing (tax, withholding, filing) | Export-only; CareCareer produces payroll-ready batch |
| NetSuite             | General ledger, AP/AR, financial reporting         | Export-only; CareCareer produces invoice-ready batch |
| Auth0/Cognito        | Authentication protocols (passwords, MFA, SSO)     | OIDC integration; CareCareer owns authorization      |
| Bullhorn (until H3)  | Recruiting workflows for all teams                 | No interaction until H3 recruiting module            |
| LaborEdge (until H4) | Travel division scheduling                         | No interaction until H4 travel module                |
| HubSpot              | Marketing automation                               | No direct CareCareer integration planned             |

### Systems INSIDE the replacement boundary (golden path):

| System                       | Being Replaced By                          | Timeline |
| ---------------------------- | ------------------------------------------ | -------- |
| Symplr CTM scheduling        | `staffing-service`                         | H1-H2    |
| Symplr CTM credentialing     | `workforce-service`                        | H1-H2    |
| Symplr CTM time/attendance   | `time-finance-service`                     | H1-H2    |
| Symplr pay/bill module       | `time-finance-service`                     | H2       |
| Maestra caregiver-service    | `workforce-service` + `staffing-service`   | H2       |
| Maestra timecard-service     | `time-finance-service`                     | H2       |
| Maestra facility-gateway     | `staffing-service`                         | H2       |
| Maestra identity-mapping     | `identity-service` + `external_references` | H1       |
| Maestra notification workers | CareCareer notification module             | H2       |
| Maestra mobile app           | New CareCareer mobile app                  | H2       |
| Maestra admin portal         | CareCareer admin portal                    | H2       |
| Maestra client portal        | CareCareer client portal                   | H2       |
