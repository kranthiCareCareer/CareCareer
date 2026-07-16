# CareCareer — Traceability Matrix

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## Purpose

Maps every golden-path business requirement through bounded context, API endpoint,
event, state transition, backlog slice, acceptance criterion, security control, and
test evidence. Prevents requirements from disappearing between architecture and
implementation.

---

## 1. Per-Diem Shift Lifecycle Requirements

### REQ-001: Facility creates a shift

| Dimension            | Reference                                                           |
| -------------------- | ------------------------------------------------------------------- |
| Business requirement | Facility/scheduler creates shift with role, times, and worker count |
| Bounded context      | Schedule & Assignment (staffing-service)                            |
| API endpoint         | `POST /v1/shifts`                                                   |
| Events               | `carecareer.shift.created.v1`                                       |
| State transition     | → DRAFT                                                             |
| Backlog slice        | GP-08                                                               |
| Acceptance criteria  | GP-08: "Valid shift created in DRAFT status"                        |
| Security controls    | TI-001–006, AZ-001 (shifts:create)                                  |
| Test evidence        | Unit: state machine; Integration: RLS, idempotency                  |

### REQ-002: Shift is published to marketplace

| Dimension            | Reference                                                  |
| -------------------- | ---------------------------------------------------------- |
| Business requirement | Published shift becomes visible to eligible workers        |
| Bounded context      | Schedule & Assignment                                      |
| API endpoint         | `POST /v1/shifts/{shiftId}/publish`                        |
| Events               | `carecareer.shift.published.v1`                            |
| State transition     | DRAFT → PUBLISHED                                          |
| Backlog slice        | GP-08                                                      |
| Acceptance criteria  | GP-08: "Valid shift moves DRAFT → PUBLISHED"               |
| Security controls    | AZ-001 (shifts:publish)                                    |
| Test evidence        | Unit: transition test; Integration: marketplace visibility |

### REQ-003: Worker eligibility is evaluated

| Dimension            | Reference                                                          |
| -------------------- | ------------------------------------------------------------------ |
| Business requirement | System determines if worker meets facility credential requirements |
| Bounded context      | Credential & Compliance (workforce-service)                        |
| API endpoint         | `POST /v1/workers/{workerId}/eligibility-evaluations`              |
| Events               | `carecareer.eligibility.evaluated.v1`                              |
| State transition     | PENDING → ELIGIBLE / INELIGIBLE / ELIGIBLE_WITH_EXCEPTION          |
| Backlog slice        | GP-07                                                              |
| Acceptance criteria  | GP-07: "Eligibility is deterministic; same inputs → same outcome"  |
| Security controls    | CC-001–005                                                         |
| Test evidence        | Unit: decision table; Integration: shadow comparison               |

### REQ-004: Eligible worker sees shift on marketplace

| Dimension            | Reference                                                          |
| -------------------- | ------------------------------------------------------------------ |
| Business requirement | Worker browsing marketplace sees only shifts they are eligible for |
| Bounded context      | Schedule & Assignment                                              |
| API endpoint         | `GET /v1/marketplace/shifts`                                       |
| Events               | N/A (query only)                                                   |
| State transition     | N/A                                                                |
| Backlog slice        | GP-09                                                              |
| Acceptance criteria  | GP-09: "Worker sees only published, available, eligible shifts"    |
| Security controls    | TI-005 (cross-tenant), CC-001 (eligibility filter)                 |
| Test evidence        | Integration: cross-tenant isolation; eligibility pre-filter        |

### REQ-005: Worker requests shift

| Dimension            | Reference                                                      |
| -------------------- | -------------------------------------------------------------- |
| Business requirement | Worker submits request; eligibility re-evaluated at submission |
| Bounded context      | Schedule & Assignment                                          |
| API endpoint         | `POST /v1/shifts/{shiftId}/requests`                           |
| Events               | `carecareer.shift-request.created.v1`                          |
| State transition     | → REQUESTED                                                    |
| Backlog slice        | GP-09                                                          |
| Acceptance criteria  | GP-09: "Eligibility rechecked at request submission time"      |
| Security controls    | AZ-001 (shift-requests:create), CC-001                         |
| Test evidence        | Integration: ineligible worker blocked; duplicate prevented    |

### REQ-006: Scheduler/client confirms assignment

| Dimension            | Reference                                                                   |
| -------------------- | --------------------------------------------------------------------------- |
| Business requirement | Authorized actor confirms shift request; assignment created                 |
| Bounded context      | Schedule & Assignment                                                       |
| API endpoint         | `POST /v1/shift-requests/{requestId}/confirm`                               |
| Events               | `carecareer.shift-request.confirmed.v1`, `carecareer.assignment.created.v1` |
| State transition     | REQUESTED/UNDER_REVIEW → CONFIRMED; Shift → PARTIALLY_FILLED/FILLED         |
| Backlog slice        | GP-10                                                                       |
| Acceptance criteria  | GP-10: "Confirmation authority follows config; eligibility re-checked"      |
| Security controls    | AZ-001 (shift-requests:confirm), CC-001                                     |
| Test evidence        | Integration: race condition, eligibility re-check, fill-count               |

### REQ-007: Worker clocks in with geofence validation

| Dimension            | Reference                                                                    |
| -------------------- | ---------------------------------------------------------------------------- |
| Business requirement | Worker clocks in; GPS validates location; credential checked                 |
| Bounded context      | Time & Timecard (time-finance-service)                                       |
| API endpoint         | `POST /v1/assignments/{assignmentId}/clock-events`                           |
| Events               | `carecareer.clock-event.recorded.v1` or `carecareer.clock-event.rejected.v1` |
| State transition     | Assignment: CONFIRMED → CHECKED_IN                                           |
| Backlog slice        | GP-11                                                                        |
| Acceptance criteria  | GP-11: "Geofence fail → rejection; credential expired → rejection"           |
| Security controls    | CC-002, AZ-005, DP-004 (location data)                                       |
| Test evidence        | Unit: geofence calc; Integration: full clock flow, offline dedup             |

### REQ-008: Worker clocks out

| Dimension            | Reference                                                            |
| -------------------- | -------------------------------------------------------------------- |
| Business requirement | Worker clocks out; worked time captured                              |
| Bounded context      | Time & Timecard                                                      |
| API endpoint         | `POST /v1/assignments/{assignmentId}/clock-events` (type: CLOCK_OUT) |
| Events               | `carecareer.clock-event.recorded.v1`                                 |
| State transition     | Assignment: CHECKED_IN/WORKING → CHECKED_OUT                         |
| Backlog slice        | GP-11                                                                |
| Acceptance criteria  | GP-11: "Out-of-sequence rejected; overnight handled"                 |
| Security controls    | AZ-005 (own assignment only)                                         |
| Test evidence        | Unit: sequence validation; Integration: overnight, DST               |

### REQ-009: Timecard generated from clock events

| Dimension            | Reference                                                         |
| -------------------- | ----------------------------------------------------------------- |
| Business requirement | System calculates worked hours, breaks, exceptions                |
| Bounded context      | Time & Timecard                                                   |
| API endpoint         | `POST /v1/assignments/{assignmentId}/timecard`                    |
| Events               | `carecareer.timecard.generated.v1`                                |
| State transition     | Timecard: → GENERATED; Assignment: CHECKED_OUT → TIMECARD_PENDING |
| Backlog slice        | GP-12                                                             |
| Acceptance criteria  | GP-12: "Clock events → calculated hours (deterministic)"          |
| Security controls    | FI-002 (immutability once approved)                               |
| Test evidence        | Unit: hour calculation, break rules; Integration: full flow       |

### REQ-010: Client approves timecard

| Dimension            | Reference                                                     |
| -------------------- | ------------------------------------------------------------- |
| Business requirement | Client reviews and approves worked hours                      |
| Bounded context      | Time & Timecard                                               |
| API endpoint         | `POST /v1/timecards/{timecardId}/approve`                     |
| Events               | `carecareer.timecard.approved.v1`                             |
| State transition     | CLIENT_REVIEW → APPROVED                                      |
| Backlog slice        | GP-12                                                         |
| Acceptance criteria  | GP-12: "Client cannot approve unauthorized facility timecard" |
| Security controls    | AZ-001 (timecards:approve), AD-001 (audit)                    |
| Test evidence        | Integration: auth check, bulk approval, audit record          |

### REQ-011: Pay and bill calculated deterministically

| Dimension            | Reference                                                            |
| -------------------- | -------------------------------------------------------------------- |
| Business requirement | Approved timecard produces exact pay and bill amounts                |
| Bounded context      | Payroll Prep + Billing (time-finance-service)                        |
| API endpoint         | `POST /v1/timecards/{timecardId}/calculations`                       |
| Events               | `carecareer.calculation.completed.v1`                                |
| State transition     | Calculation: PENDING → CALCULATING → COMPLETED                       |
| Backlog slice        | GP-13                                                                |
| Acceptance criteria  | GP-13: "Deterministic; same inputs → same result"                    |
| Security controls    | FI-001–005, AD-001                                                   |
| Test evidence        | Unit: decision table ALL rule combos; Integration: Symplr comparison |

### REQ-012: Export-ready output produced

| Dimension            | Reference                                                  |
| -------------------- | ---------------------------------------------------------- |
| Business requirement | Paycom and NetSuite format previews generated (no posting) |
| Bounded context      | Payroll Prep + Billing                                     |
| API endpoint         | `POST /v1/calculations/{calculationId}/export-preview`     |
| Events               | `carecareer.export-preview.generated.v1`                   |
| State transition     | Timecard: CALCULATED → EXPORT_READY                        |
| Backlog slice        | GP-13                                                      |
| Acceptance criteria  | GP-13: "Export preview matches format requirements"        |
| Security controls    | FI-005 (no auto-posting)                                   |
| Test evidence        | Integration: format validation against spec                |

---

## 2. Cross-Cutting Requirements

### REQ-C01: Tenant isolation at all layers

| Dimension            | Reference                                             |
| -------------------- | ----------------------------------------------------- |
| Business requirement | Tenant A cannot access Tenant B's data                |
| Bounded context      | ALL                                                   |
| Security controls    | TI-001 through TI-010                                 |
| Backlog slices       | GP-01 (template), validated in every subsequent slice |
| Test evidence        | Negative tests in CI; penetration test before pilot   |

### REQ-C02: Immutable audit trail

| Dimension            | Reference                                                |
| -------------------- | -------------------------------------------------------- |
| Business requirement | Every privileged action is recorded and tamper-proof     |
| Bounded context      | Platform (audit module)                                  |
| Security controls    | AD-001 through AD-005                                    |
| Backlog slices       | GP-01 (template), GP-02 (platform-service)               |
| Test evidence        | Append-only test; audit record exists for every mutation |

### REQ-C03: Deterministic compliance blocking

| Dimension            | Reference                                              |
| -------------------- | ------------------------------------------------------ |
| Business requirement | Expired credentials block work — never AI, always code |
| Bounded context      | Credential & Compliance                                |
| Security controls    | CC-001 through CC-005                                  |
| Backlog slice        | GP-07                                                  |
| Test evidence        | Decision table; code review confirms no ML in path     |

### REQ-C04: Financial immutability

| Dimension            | Reference                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| Business requirement | Completed calculations never modified; corrections create new versions |
| Bounded context      | Payroll Prep + Billing                                                 |
| Security controls    | FI-001, FI-002, FI-003                                                 |
| Backlog slice        | GP-13                                                                  |
| Test evidence        | Mutation attempt on COMPLETED fails; superseding creates new record    |

### REQ-C05: Legacy systems remain operational

| Dimension            | Reference                                             |
| -------------------- | ----------------------------------------------------- |
| Business requirement | Maestra/Symplr continue undisturbed during build      |
| Bounded context      | Migration layer                                       |
| Migration document   | migration-map.md                                      |
| Backlog slice        | GP-14 (adapter), GP-16 (pilot)                        |
| Test evidence        | Symplr processing unaffected; reconciliation confirms |

---

## 3. Requirement Coverage Summary

| Requirement                    | Context | API | Event | State Machine | Slice    | Security | Test |
| ------------------------------ | ------- | --- | ----- | ------------- | -------- | -------- | ---- |
| REQ-001 Shift creation         | ✓       | ✓   | ✓     | ✓             | GP-08    | ✓        | ✓    |
| REQ-002 Shift publication      | ✓       | ✓   | ✓     | ✓             | GP-08    | ✓        | ✓    |
| REQ-003 Eligibility evaluation | ✓       | ✓   | ✓     | ✓             | GP-07    | ✓        | ✓    |
| REQ-004 Marketplace visibility | ✓       | ✓   | —     | —             | GP-09    | ✓        | ✓    |
| REQ-005 Shift request          | ✓       | ✓   | ✓     | ✓             | GP-09    | ✓        | ✓    |
| REQ-006 Confirmation           | ✓       | ✓   | ✓     | ✓             | GP-10    | ✓        | ✓    |
| REQ-007 Clock-in               | ✓       | ✓   | ✓     | ✓             | GP-11    | ✓        | ✓    |
| REQ-008 Clock-out              | ✓       | ✓   | ✓     | ✓             | GP-11    | ✓        | ✓    |
| REQ-009 Timecard generation    | ✓       | ✓   | ✓     | ✓             | GP-12    | ✓        | ✓    |
| REQ-010 Timecard approval      | ✓       | ✓   | ✓     | ✓             | GP-12    | ✓        | ✓    |
| REQ-011 Pay/bill calculation   | ✓       | ✓   | ✓     | ✓             | GP-13    | ✓        | ✓    |
| REQ-012 Export preview         | ✓       | ✓   | ✓     | ✓             | GP-13    | ✓        | ✓    |
| REQ-C01 Tenant isolation       | ✓       | —   | —     | —             | GP-01+   | ✓        | ✓    |
| REQ-C02 Audit trail            | ✓       | —   | —     | —             | GP-01+   | ✓        | ✓    |
| REQ-C03 Compliance blocking    | ✓       | ✓   | ✓     | ✓             | GP-07    | ✓        | ✓    |
| REQ-C04 Financial immutability | ✓       | ✓   | ✓     | ✓             | GP-13    | ✓        | ✓    |
| REQ-C05 Legacy operational     | ✓       | —   | —     | —             | GP-14/16 | —        | ✓    |

**Coverage: 100%** — Every golden-path requirement traces through all architecture layers
to a testable acceptance criterion with named security controls.

---

## 4. Gap Analysis

| Potential Gap                                   | Status                    | Resolution                                                             |
| ----------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Notification (shift published → push to worker) | Not in golden-path slice  | Deferred to post-GP-10; notification module added when needed          |
| Mobile UI                                       | Not in golden-path slices | API-first; mobile app built against golden-path APIs in parallel or H2 |
| Client portal UI                                | GP-04 is admin only       | Client portal slice added after GP-12 (timecard approval UI)           |
| Worker portal UI                                | Not in golden-path slices | Worker-facing API complete; UI can be built in parallel                |
| AI recommendations                              | Explicitly excluded       | GP-07 through GP-13 are deterministic; AI added in H2+                 |
| Bulk operations                                 | Deferred                  | Single-item operations work; bulk optimization post-pilot              |
| Reporting/analytics                             | Deferred to H5            | Direct queries sufficient for pilot                                    |

These gaps are intentional scope boundaries, not missing requirements.
Each is documented with a resolution path.
