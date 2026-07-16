# CareCareer — Data Ownership Matrix

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Purpose

This document defines stage-specific data ownership during the CareCareer migration. Ownership is not binary — it transitions through defined stages with explicit cutover conditions.

---

## 2. Ownership Stages

| Stage                     | Meaning                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| **Current SoR**           | System that owns this data today in production                    |
| **CareCareer Pilot Role** | What CareCareer does with this data during pilot (before cutover) |
| **Shadow Source**         | Where CareCareer reads comparison data for reconciliation         |
| **Target SoR**            | System that will own this data after successful cutover           |
| **Cutover Condition**     | What must be true before CareCareer becomes the system of record  |

---

## 3. Golden-Path Domain Objects

### 3.1 Platform & Identity

| Domain Object         | Current SoR                             | CareCareer Pilot Role                     | Shadow Source            | Target SoR                                          | Cutover Condition                                          |
| --------------------- | --------------------------------------- | ----------------------------------------- | ------------------------ | --------------------------------------------------- | ---------------------------------------------------------- |
| Tenant                | Maestra config + Symplr tenant config   | Write (new canonical model)               | N/A (new concept)        | `platform-service`                                  | Tenant provisioning and isolation tests pass               |
| Organization / Branch | Symplr org hierarchy                    | Write (new canonical model)               | Symplr replicated DB     | `platform-service`                                  | Org mapping reconciles with Symplr                         |
| User Identity         | Auth0 + Maestra identity mapping        | Map external subjects to CareCareer users | Auth0 user store         | `identity-service` (mapping) + OIDC provider (auth) | All active users mapped, role assignments verified         |
| Role / Permission     | Maestra hard-coded + Symplr roles       | Write (new RBAC/ABAC model)               | Maestra permission logic | `identity-service`                                  | Permission evaluation produces equivalent access decisions |
| Audit Trail           | Distributed (Maestra logs, Symplr logs) | Write (new immutable audit)               | N/A (new capability)     | `platform-service` (audit module)                   | All golden-path mutations produce audit records            |

### 3.2 Workforce & Compliance

| Domain Object         | Current SoR                            | CareCareer Pilot Role                           | Shadow Source             | Target SoR               | Cutover Condition                                                       |
| --------------------- | -------------------------------------- | ----------------------------------------------- | ------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| Worker Profile        | Symplr CTM + Bullhorn candidate record | Read model (replicated from Symplr)             | Symplr replicated DB      | `workforce-service`      | Profile and demographic reconciliation passes (>99% field match)        |
| Worker Status         | Symplr (active/inactive/terminated)    | Shadow evaluation                               | Symplr status field       | `workforce-service`      | Status transitions match for 60-day observation window                  |
| Worker Availability   | Symplr scheduling module               | Shadow copy + new pilot data                    | Symplr availability       | `workforce-service`      | Availability updates propagate correctly for pilot workers              |
| Credential Record     | Symplr CTM                             | Shadow evaluation                               | Symplr credential tables  | `workforce-service`      | Eligibility results match approved baseline for all credential types    |
| Credential Document   | Symplr document store                  | Read reference (for comparison)                 | Symplr document storage   | `workforce-service` + S3 | Documents migrated and accessible; OCR extraction matches Symplr fields |
| Compliance Status     | Symplr CTM (derived from credentials)  | Shadow calculation                              | Symplr compliance status  | `workforce-service`      | Deterministic eligibility engine produces same block/allow decisions    |
| Facility Requirements | Symplr requirement matrix              | Write (new canonical model, seeded from Symplr) | Symplr requirement config | `workforce-service`      | Requirements matrix matches Symplr for all pilot facilities             |

### 3.3 Client & Facility

| Domain Object     | Current SoR             | CareCareer Pilot Role               | Shadow Source            | Target SoR         | Cutover Condition                                        |
| ----------------- | ----------------------- | ----------------------------------- | ------------------------ | ------------------ | -------------------------------------------------------- |
| Client            | Symplr + Bullhorn (CRM) | Write (new canonical model, seeded) | Symplr client tables     | `staffing-service` | Client records match; contacts and hierarchy verified    |
| Facility          | Symplr CTM              | Write (new canonical model, seeded) | Symplr facility tables   | `staffing-service` | Facility config, departments, and requirements reconcile |
| Department / Unit | Symplr CTM              | Write (seeded from Symplr)          | Symplr department tables | `staffing-service` | Departmental assignment rules match                      |
| Facility Contact  | Symplr + Maestra        | Write (new)                         | Symplr contact data      | `staffing-service` | Contacts mapped with correct notification preferences    |

### 3.4 Scheduling & Assignment

| Domain Object        | Current SoR                     | CareCareer Pilot Role                                 | Shadow Source                | Target SoR                               | Cutover Condition                                                |
| -------------------- | ------------------------------- | ----------------------------------------------------- | ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Shift                | Symplr scheduling               | Shadow copy for existing + write for new pilot shifts | Symplr shift tables          | `staffing-service`                       | Shift lifecycle and counts reconcile for pilot region            |
| Shift Offer          | Symplr/Maestra mobile push      | Write (new offer model)                               | Maestra push logs            | `staffing-service`                       | Workers receive and respond to offers; conversion rates tracked  |
| Assignment           | Symplr scheduling               | Shadow copy (existing) + write (pilot)                | Symplr assignment tables     | `staffing-service`                       | Assignment state machine matches; no lost assignments            |
| Cancellation         | Symplr scheduling               | Write (pilot shifts)                                  | Symplr cancellation records  | `staffing-service`                       | Cancellation workflows complete correctly; replacement triggered |
| Eligibility Decision | Symplr (implicit in assignment) | Shadow evaluation + write (pilot)                     | Symplr assignment validation | `staffing-service` + `workforce-service` | Eligibility decisions match for 100% of tested scenarios         |

### 3.5 Time & Finance

| Domain Object      | Current SoR                       | CareCareer Pilot Role            | Shadow Source                    | Target SoR             | Cutover Condition                                                              |
| ------------------ | --------------------------------- | -------------------------------- | -------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| Clock Event        | Maestra mobile app + Symplr       | Parallel write (pilot workers)   | Existing Maestra clock records   | `time-finance-service` | Clock events captured with geofence; timestamps reconcile                      |
| Break Record       | Symplr time module                | Write (pilot)                    | Symplr break records             | `time-finance-service` | Break rules enforced correctly per state                                       |
| Geofence Evidence  | Maestra mobile (GPS)              | Write (pilot)                    | Maestra GPS logs                 | `time-finance-service` | Geofence validation produces same accept/reject                                |
| Timecard           | Maestra timecard service + Symplr | Parallel calculation             | Existing timecard service output | `time-finance-service` | Hours, exceptions, and approval status reconcile                               |
| Timecard Exception | Symplr + manual review            | Write (pilot)                    | Symplr exception queue           | `time-finance-service` | Exception detection rate matches or improves                                   |
| Timecard Approval  | Symplr + Maestra client portal    | Write (pilot)                    | Existing approval records        | `time-finance-service` | Approvals route correctly; client portal functional                            |
| Pay Calculation    | Symplr pay rules                  | Calculation preview (no posting) | Symplr pay output                | `time-finance-service` | Deterministic calculation matches Symplr within $0.01 per line item            |
| Pay Rule           | Symplr configuration              | Write (seeded from Symplr rules) | Symplr pay-rule config           | `time-finance-service` | All rule types (OT, differential, holiday, guaranteed) produce correct results |
| Bill Calculation   | Symplr bill rules                 | Calculation preview (no posting) | Symplr bill output               | `time-finance-service` | Bill amounts match within $0.01 per line item                                  |
| Payroll Export     | Symplr → Paycom                   | Preview only (no actual export)  | Symplr export records            | `time-finance-service` | Export format matches Paycom requirements; finance approves                    |
| Invoice            | Symplr → NetSuite                 | Preview only (no actual posting) | Symplr invoice records           | `time-finance-service` | Invoice totals and line items match; finance approves                          |

---

## 4. Systems That REMAIN External (Not Replaced)

| System                        | Role                                                     | Integration Pattern        | CareCareer Responsibility                         |
| ----------------------------- | -------------------------------------------------------- | -------------------------- | ------------------------------------------------- |
| **Paycom**                    | Payroll processor (tax, withholding, filing, remittance) | Outbound file/API export   | Produce payroll-ready batch in Paycom format      |
| **NetSuite**                  | Financial ledger (GL, AP/AR, financial reporting)        | Outbound file/API export   | Produce invoice-ready batch in NetSuite format    |
| **Auth0 / Cognito**           | Identity protocol (passwords, MFA, SSO, tokens)          | OIDC integration           | Consume verified identity; own authorization      |
| **Background Check Provider** | Background screening                                     | Webhook inbound            | Consume results; update credential status         |
| **State Board APIs**          | License verification                                     | Outbound verification call | Primary source verification for credential module |
| **Communications Provider**   | Email/SMS/Push delivery                                  | Outbound API               | Compose and send; track delivery                  |

---

## 5. Data That Must Be Seeded Before Pilot

For the golden-path pilot to run, CareCareer must have canonical copies of:

| Data Set                         | Source                    | Seed Method                     | Volume Estimate                 |
| -------------------------------- | ------------------------- | ------------------------------- | ------------------------------- |
| Tenants + Orgs + Branches        | Symplr org config         | Manual config (small)           | 1-5 tenants for pilot           |
| Facilities + Departments         | Symplr facility tables    | ETL script from replicated DB   | 10-50 facilities for pilot      |
| Facility Credential Requirements | Symplr requirement matrix | ETL script                      | Requirements per facility       |
| Workers (pilot region)           | Symplr worker tables      | ETL script with field mapping   | 100-500 workers for pilot       |
| Worker Credentials               | Symplr credential tables  | ETL script + document reference | 3-10 credentials per worker     |
| Pay Rules                        | Symplr pay-rule config    | Manual config (complex rules)   | ~20-50 rule sets                |
| Bill Rules                       | Symplr bill-rule config   | Manual config                   | ~20-50 rule sets                |
| Users + Roles                    | Auth0 + Maestra mapping   | Identity mapping script         | 20-100 internal users for pilot |

---

## 6. Reconciliation Requirements

### 6.1 Shadow Mode Reconciliation

During pilot, CareCareer runs in shadow mode alongside the existing system:

```
Real workflow:    Client → Symplr/Maestra → Paycom/NetSuite (unchanged)
Shadow workflow:  Same input → CareCareer → Compare output (no real effect)
```

### 6.2 Reconciliation Metrics

| Domain              | Metric                                | Required Threshold                     |
| ------------------- | ------------------------------------- | -------------------------------------- |
| Eligibility         | CareCareer allow/block matches Symplr | 100% match (zero false-allows)         |
| Shift State         | Shift lifecycle status matches        | 99%+ match                             |
| Timecard Hours      | Calculated hours match                | 100% match (within 1-minute tolerance) |
| Pay Calculation     | Per-line-item pay matches             | 100% match (within $0.01)              |
| Bill Calculation    | Per-line-item bill matches            | 100% match (within $0.01)              |
| Exception Detection | Same exceptions flagged               | 95%+ match (CareCareer may flag more)  |
| Approval Routing    | Correct approvers notified            | 100% match                             |

### 6.3 Reconciliation Process

1. **Daily batch comparison**: CareCareer calculates results for all pilot shifts; automated comparison against Symplr/Maestra output.
2. **Exception report**: Mismatches produce a reconciliation exception with full detail (expected vs actual, root cause).
3. **Resolution tracking**: Every mismatch is categorized (CareCareer bug, Symplr bug, data quality, rule interpretation) and resolved.
4. **Trend dashboard**: Mismatch rate over time, trending toward zero.

---

## 7. Cutover Decision Framework

Cutover from shadow mode to CareCareer-as-SoR requires ALL of the following:

| Gate                        | Criteria                                                       |
| --------------------------- | -------------------------------------------------------------- |
| **Data quality**            | Reconciliation metrics meet thresholds for 30 consecutive days |
| **Functional completeness** | All golden-path workflows execute without manual intervention  |
| **Performance**             | p95 latency under 500ms for all golden-path APIs               |
| **Security**                | Tenant isolation tests pass; security review complete          |
| **Operational readiness**   | Runbooks, dashboards, alerts, on-call rotation in place        |
| **Rollback tested**         | Proven ability to revert to Symplr/Maestra within 4 hours      |
| **Finance approval**        | Finance team signs off on pay/bill calculation accuracy        |
| **Operations approval**     | Operations team signs off on workflow completeness             |
| **Client communication**    | Affected clients informed of any UX changes                    |

---

## 8. Post-Cutover Coexistence

After CareCareer becomes SoR for the pilot workload:

| Aspect              | Behavior                                                   |
| ------------------- | ---------------------------------------------------------- |
| New shifts          | Created in CareCareer only                                 |
| In-flight shifts    | Complete in original system; no mid-shift migration        |
| Historical data     | Remains in Symplr/Maestra; available via read adapter      |
| Payroll export      | CareCareer produces the export (replaces Symplr for pilot) |
| Billing export      | CareCareer produces the export (replaces Symplr for pilot) |
| Rollback window     | 14 days post-cutover; Symplr still receives shadow writes  |
| Non-pilot workloads | Continue unchanged in Symplr/Maestra                       |

---

## 9. Ownership Transition Timeline

```
H0 (Aug-Oct 2026):  Symplr = SoR for all          CareCareer = not running
H1 (Nov-Jan 2027):  Symplr = SoR for all          CareCareer = shadow mode (pilot region)
H2 (Feb-Apr 2027):  Symplr = SoR for non-pilot    CareCareer = SoR for pilot per-diem
H3 (May-Jul 2027):  Symplr = SoR for compliance   CareCareer = SoR for pilot per-diem + recruit (pilot teams)
                     Bullhorn retirement begins
H4 (Aug-Oct 2027):  Symplr = SoR for non-migrated CareCareer = SoR for per-diem + travel (pilot)
H5 (Nov-Jan 2028):  CareCareer = SoR for all migrated tenants/regions
                     Symplr/Bullhorn = archive + non-migrated only
```
