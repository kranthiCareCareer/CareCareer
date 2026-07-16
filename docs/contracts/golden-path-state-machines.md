# CareCareer — Golden Path State Machines

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Rules

- All state transitions are deterministic commands (code decides, never AI).
- Command handlers validate current state, authorization, policy, and invariants.
- Successful transitions write state change + audit record + outbox event in one transaction.
- Invalid transitions return a typed error and MUST NOT silently succeed.
- Tests MUST cover every allowed AND denied transition.
- State is stored as a single explicit field, never inferred from scattered columns.

---

## 2. Shift Lifecycle

Supports `requiredWorkerCount >= 1`. A shift is PARTIALLY_FILLED when at least one
but fewer than `requiredWorkerCount` assignments are confirmed. FILLED when all slots
are confirmed.

```
               ┌──────────────────────────────────────────────────┐
               │                                                    │
    ┌──────┐   │  ┌───────────┐   ┌─────────────────┐   ┌────────┐│
    │DRAFT │───┼─▶│PUBLISHED  │──▶│PARTIALLY_FILLED │──▶│FILLED  ││
    └──┬───┘   │  └─────┬─────┘   └────────┬────────┘   └───┬────┘│
       │       │        │                   │                 │     │
       │       │        │                   │                 │     │
       ▼       │        ▼                   ▼                 ▼     │
  ┌─────────┐  │   ┌─────────┐        ┌─────────┐      ┌─────────┐│
  │CANCELLED│  │   │CANCELLED│        │CANCELLED│      │IN_PROG- ││
  └─────────┘  │   └─────────┘        └─────────┘      │RESS     ││
               │                                        └────┬────┘│
               │                                             │     │
               │                                             ▼     │
               │                                        ┌─────────┐│
               │                                        │COMPLETED││
               │                                        └────┬────┘│
               │                                             │     │
               │                                             ▼     │
               │                                        ┌─────────┐│
               │                                        │CLOSED   ││
               │                                        └─────────┘│
               └──────────────────────────────────────────────────┘
```

### Allowed Transitions

| From             | To               | Command           | Conditions                                                      |
| ---------------- | ---------------- | ----------------- | --------------------------------------------------------------- |
| DRAFT            | PUBLISHED        | PublishShift      | All required fields populated; credential requirements attached |
| DRAFT            | CANCELLED        | CancelShift       | Always allowed from DRAFT                                       |
| PUBLISHED        | PARTIALLY_FILLED | ConfirmAssignment | First assignment confirmed; requiredWorkerCount > 1             |
| PUBLISHED        | FILLED           | ConfirmAssignment | requiredWorkerCount == 1, or last slot filled                   |
| PUBLISHED        | CANCELLED        | CancelShift       | Client/scheduler cancels                                        |
| PARTIALLY_FILLED | FILLED           | ConfirmAssignment | Last slot filled                                                |
| PARTIALLY_FILLED | PUBLISHED        | CancelAssignment  | All confirmed assignments cancelled; slots reopen               |
| PARTIALLY_FILLED | CANCELLED        | CancelShift       | Client/scheduler cancels all                                    |
| FILLED           | IN_PROGRESS      | RecordClockIn     | Any assigned worker clocks in                                   |
| FILLED           | CANCELLED        | CancelShift       | All assignments cancelled before shift starts                   |
| IN_PROGRESS      | COMPLETED        | CompleteShift     | All assigned workers have clocked out OR shift end time passed  |
| COMPLETED        | CLOSED           | CloseShift        | All timecards approved and calculations export-ready            |

### Overnight Shift Handling

- Shifts that span midnight use UTC start/end times
- `businessDate` is the calendar date the shift "belongs to" (typically the start date)
- Overtime calculations use the facility timezone for daily OT boundaries
- DST transitions: clock events use UTC; display uses facility timezone

---

## 3. Shift Request Lifecycle

```
  ┌──────────┐    ┌──────────────┐    ┌───────────┐
  │REQUESTED │───▶│UNDER_REVIEW  │───▶│CONFIRMED  │
  └────┬─────┘    └──────┬───────┘    └───────────┘
       │                  │
       │                  ▼
       │            ┌───────────┐
       │            │REJECTED   │
       │            └───────────┘
       │
       ├───────────▶┌───────────┐
       │            │WITHDRAWN  │  (worker withdraws before review)
       │            └───────────┘
       │
       └───────────▶┌───────────┐
                    │EXPIRED    │  (TTL elapsed without review)
                    └───────────┘
```

### Allowed Transitions

| From         | To           | Command              | Conditions                                           |
| ------------ | ------------ | -------------------- | ---------------------------------------------------- |
| REQUESTED    | UNDER_REVIEW | ReviewShiftRequest   | Scheduler/client opens review                        |
| REQUESTED    | CONFIRMED    | ConfirmShiftRequest  | Auto-confirm policy passes (no manual review needed) |
| REQUESTED    | WITHDRAWN    | WithdrawShiftRequest | Worker cancels before confirmation                   |
| REQUESTED    | EXPIRED      | ExpireShiftRequest   | TTL elapsed (configurable per tenant/facility)       |
| UNDER_REVIEW | CONFIRMED    | ConfirmShiftRequest  | Scheduler/client/policy confirms                     |
| UNDER_REVIEW | REJECTED     | RejectShiftRequest   | Scheduler/client rejects with reason                 |

### Who Can Confirm

Confirmation authority (configurable per tenant/facility):

1. **Scheduler** — internal coordinator manually confirms
2. **Client** — hiring manager at facility confirms
3. **Policy engine** — auto-confirm when: eligibility passes, no OT threshold, no scheduling conflict

---

## 4. Assignment Lifecycle

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │CONFIRMED │───▶│CHECKED_IN│───▶│ON_BREAK  │───▶│WORKING   │
  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
       │               │               │               │
       │               │               │               ▼
       │               │               │          ┌───────────┐
       │               │               └─────────▶│CHECKED_OUT│
       │               │                          └─────┬─────┘
       │               │                                │
       │               │                                ▼
       │               │                          ┌───────────────┐
       │               │                          │TIMECARD_PENDING│
       │               │                          └───────┬───────┘
       │               │                                  │
       │               │                                  ▼
       │               │                          ┌───────────┐
       │               │                          │COMPLETED  │
       │               │                          └───────────┘
       │               │
       │               ▼
       │          ┌───────────┐
       │          │ABANDONED  │  (checked in but never checked out; shift end passed)
       │          └───────────┘
       │
       ├─────────▶┌───────────┐
       │          │CANCELLED  │  (before shift starts)
       │          └───────────┘
       │
       └─────────▶┌───────────┐
                  │NO_SHOW    │  (15 min past start, no clock-in)
                  └───────────┘
```

### Allowed Transitions

| From             | To               | Command          | Conditions                                              |
| ---------------- | ---------------- | ---------------- | ------------------------------------------------------- |
| CONFIRMED        | CHECKED_IN       | RecordClockIn    | Geofence valid; credential valid; within allowed window |
| CONFIRMED        | CANCELLED        | CancelAssignment | Worker/client/scheduler cancels before shift            |
| CONFIRMED        | NO_SHOW          | ReportNoShow     | 15 min past shift start, no clock-in recorded           |
| CHECKED_IN       | ON_BREAK         | RecordBreakStart | Break allowed per state rules                           |
| CHECKED_IN       | CHECKED_OUT      | RecordClockOut   | Worker checks out (no break taken)                      |
| CHECKED_IN       | ABANDONED        | MarkAbandoned    | Shift end passed, no clock-out, no contact              |
| ON_BREAK         | WORKING          | RecordBreakEnd   | Break ended                                             |
| ON_BREAK         | CHECKED_OUT      | RecordClockOut   | Worker checks out (break auto-ended)                    |
| WORKING          | ON_BREAK         | RecordBreakStart | Additional break (if allowed)                           |
| WORKING          | CHECKED_OUT      | RecordClockOut   | Worker checks out                                       |
| CHECKED_OUT      | TIMECARD_PENDING | GenerateTimecard | System auto-generates timecard                          |
| TIMECARD_PENDING | COMPLETED        | MarkComplete     | Timecard approved and calculation export-ready          |

### Credential Expiry After Assignment

If a credential expires AFTER assignment but BEFORE the shift:

1. `carecareer.credential.expired.v1` event fires
2. `staffing-service` consumes it
3. If the affected credential is required for the assigned facility:
   - Assignment status → CANCELLED (reason: CREDENTIAL_EXPIRED)
   - Shift slot reopens (FILLED → PARTIALLY_FILLED or PUBLISHED)
   - Notification sent to worker and scheduler
4. If at clock-in time: clock-in is REJECTED with `CREDENTIAL_EXPIRED` error

---

## 5. Credential Lifecycle

```
  ┌──────────┐    ┌──────────┐    ┌─────────────────────┐    ┌──────────┐
  │UPLOADED  │───▶│EXTRACTED │───▶│PENDING_VERIFICATION │───▶│VERIFIED  │
  └──────────┘    └──────────┘    └──────────┬──────────┘    └────┬─────┘
                                             │                     │
                                             ▼                     ▼
                                        ┌──────────┐         ┌──────────┐
                                        │REJECTED  │         │EXPIRING  │
                                        └──────────┘         └────┬─────┘
                                                                  │
                                                                  ▼
                                                             ┌──────────┐
                                                             │EXPIRED   │
                                                             └──────────┘

  Additional from VERIFIED:
  VERIFIED ──▶ REVOKED  (OIG/SAM exclusion, disciplinary action)
```

### Allowed Transitions

| From                 | To                   | Command               | Conditions                                  |
| -------------------- | -------------------- | --------------------- | ------------------------------------------- |
| UPLOADED             | EXTRACTED            | ExtractCredential     | OCR or manual data extraction complete      |
| EXTRACTED            | PENDING_VERIFICATION | SubmitForVerification | Data extracted, ready for PSV               |
| PENDING_VERIFICATION | VERIFIED             | VerifyCredential      | Primary source verification passes          |
| PENDING_VERIFICATION | REJECTED             | RejectCredential      | Verification fails with documented reason   |
| VERIFIED             | EXPIRING             | MarkExpiring          | 90/60/30 days before expiresAt              |
| VERIFIED             | REVOKED              | RevokeCredential      | OIG/SAM/state board action                  |
| EXPIRING             | EXPIRED              | ExpireCredential      | Current date >= expiresAt                   |
| EXPIRING             | VERIFIED             | RenewCredential       | Worker submits renewed credential, verified |
| EXPIRED              | UPLOADED             | ResubmitCredential    | Worker uploads new/renewed document         |
| REJECTED             | UPLOADED             | ResubmitCredential    | Worker uploads corrected document           |

### Expiration Monitoring

- Daily scheduled job checks all VERIFIED and EXPIRING credentials
- 90 days: status → EXPIRING; notification sent (friendly reminder)
- 60 days: escalation notification (include renewal instructions)
- 30 days: alert coordinator; warn of upcoming compliance gap
- 0 days: status → EXPIRED; BLOCK worker; cancel affected assignments

---

## 6. Eligibility Evaluation

```
  ┌─────────┐    ┌──────────┐
  │PENDING  │───▶│ELIGIBLE  │
  └────┬────┘    └──────────┘
       │
       ├────────▶┌────────────┐
       │         │INELIGIBLE  │
       │         └────────────┘
       │
       ├────────▶┌──────────────────────────┐
       │         │ELIGIBLE_WITH_EXCEPTION   │
       │         └──────────────────────────┘
       │
       └────────▶┌─────────┐
                 │ERROR     │
                 └─────────┘
```

### Evaluation Points

Eligibility is checked at four points in the golden path:

| Point                   | When                     | Behavior if INELIGIBLE                       |
| ----------------------- | ------------------------ | -------------------------------------------- |
| MARKETPLACE_DISPLAY     | Worker browses shifts    | Shift hidden from worker                     |
| REQUEST_SUBMISSION      | Worker taps "Request"    | Request blocked; error returned with reasons |
| ASSIGNMENT_CONFIRMATION | Scheduler confirms       | Confirmation blocked; alert scheduler        |
| CLOCK_IN                | Worker attempts clock-in | Clock-in rejected; alert worker and ops      |

### Evaluation Logic (Deterministic)

```
FOR EACH credential requirement of facility + department + role:
  IF worker has matching credential:
    IF credential.status IN (VERIFIED, EXPIRING):
      reason = CREDENTIAL_VALID
    ELSE IF credential.status == EXPIRED:
      reason = CREDENTIAL_EXPIRED (blocking)
    ELSE IF credential.status == PENDING_VERIFICATION:
      reason = CREDENTIAL_PENDING (blocking unless exception)
  ELSE:
    reason = CREDENTIAL_MISSING (blocking)

CHECK scheduling conflicts:
  IF worker has overlapping confirmed assignment:
    reason = AVAILABILITY_CONFLICT (blocking)

CHECK worker status:
  IF worker.status == BLOCKED:
    reason = BLOCKED (blocking)

CHECK exclusions:
  IF worker has active OIG/SAM exclusion:
    reason = OIG_EXCLUSION or SAM_EXCLUSION (blocking)

RESULT:
  IF any blocking reason exists → INELIGIBLE
  ELSE IF non-blocking exceptions exist → ELIGIBLE_WITH_EXCEPTION
  ELSE → ELIGIBLE
```

Every evaluation stores the full list of reasons (never just a boolean).

---

## 7. Timecard Lifecycle

```
  ┌──────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
  │DRAFT │───▶│GENERATED │───▶│WORKER_REVIEW │───▶│SUBMITTED │
  └──────┘    └──────────┘    └──────────────┘    └────┬─────┘
                                                       │
                                                       ▼
                                                  ┌──────────────┐
                                                  │CLIENT_REVIEW │
                                                  └──────┬───────┘
                                                         │
                                         ┌───────────────┼───────────────┐
                                         │               │               │
                                         ▼               ▼               │
                                    ┌──────────┐   ┌──────────┐         │
                                    │APPROVED  │   │REJECTED  │         │
                                    └────┬─────┘   └────┬─────┘         │
                                         │              │               │
                                         │              ▼               │
                                         │         ┌──────────┐         │
                                         │         │CORRECTED │─────────┘
                                         │         └──────────┘  (re-submits)
                                         │
                                         ▼
                                    ┌──────────┐
                                    │CALCULATED│
                                    └────┬─────┘
                                         │
                                         ▼
                                    ┌────────────┐
                                    │EXPORT_READY│
                                    └────────────┘

  Additional:
  APPROVED ──▶ ADJUSTMENT_REQUIRED  (post-approval correction needed)
  ADJUSTMENT_REQUIRED ──▶ CORRECTED ──▶ SUBMITTED  (re-enters flow)
```

### Allowed Transitions

| From                | To                  | Command             | Conditions                                       |
| ------------------- | ------------------- | ------------------- | ------------------------------------------------ |
| DRAFT               | GENERATED           | GenerateTimecard    | Clock events complete; hours calculated          |
| GENERATED           | WORKER_REVIEW       | RouteToWorkerReview | Worker review configured (optional step)         |
| GENERATED           | SUBMITTED           | SubmitTimecard      | Auto-submit if no worker review required         |
| WORKER_REVIEW       | SUBMITTED           | SubmitTimecard      | Worker confirms or system auto-submits after TTL |
| SUBMITTED           | CLIENT_REVIEW       | RouteToClientReview | Approval workflow routes to client               |
| CLIENT_REVIEW       | APPROVED            | ApproveTimecard     | Client or bulk-approval approves                 |
| CLIENT_REVIEW       | REJECTED            | RejectTimecard      | Client disputes; provides reason                 |
| REJECTED            | CORRECTED           | CorrectTimecard     | Admin/worker corrects hours; version increments  |
| CORRECTED           | SUBMITTED           | ResubmitTimecard    | Corrected timecard re-enters approval flow       |
| APPROVED            | CALCULATED          | CalculatePayBill    | Pay and bill calculation completes               |
| APPROVED            | ADJUSTMENT_REQUIRED | RequireAdjustment   | Post-approval correction needed                  |
| ADJUSTMENT_REQUIRED | CORRECTED           | CorrectTimecard     | Correction applied                               |
| CALCULATED          | EXPORT_READY        | MarkExportReady     | Calculation reviewed and ready                   |

### Bulk Approval

Clients can approve in bulk. The endpoint is the same (`POST /v1/timecards/{id}/approve`)
called repeatedly. A future batch endpoint may be added but is not required for pilot.

### Break Corrections

Breaks are corrected by:

1. Admin creates a corrected timecard (version increments)
2. Corrected timecard re-enters SUBMITTED → CLIENT_REVIEW flow
3. Previous version preserved (never mutated)
4. Calculation uses the latest approved version

### Version Handling

- `version` field increments on every correction
- Each version is a separate audit record
- Calculation references `timecardVersion`
- If a timecard is corrected after calculation, the old calculation gets `SUPERSEDED` status

---

## 8. Calculation Lifecycle

```
  ┌─────────┐    ┌────────────┐    ┌───────────┐
  │PENDING  │───▶│CALCULATING │───▶│COMPLETED  │
  └─────────┘    └─────┬──────┘    └───────────┘
                        │
                        ▼
                   ┌──────────┐
                   │FAILED    │
                   └──────────┘

  Additional:
  COMPLETED ──▶ SUPERSEDED  (timecard corrected; new calculation replaces this one)
```

### Allowed Transitions

| From        | To          | Command              | Conditions                                   |
| ----------- | ----------- | -------------------- | -------------------------------------------- |
| PENDING     | CALCULATING | StartCalculation     | Approved timecard + valid rule set available |
| CALCULATING | COMPLETED   | CompleteCalculation  | All line items calculated successfully       |
| CALCULATING | FAILED      | FailCalculation      | Missing rule, data error, or system failure  |
| COMPLETED   | SUPERSEDED  | SupersedeCalculation | Timecard corrected; new calculation created  |

### Versioning Rules

- A corrected timecard creates a NEW calculation (new ID)
- The previous calculation's status → SUPERSEDED with `supersededBy` pointing to new calc
- Previously approved financial results are NEVER mutated
- The explanation trace is immutable once COMPLETED
- Rate rules are versioned; calculation stores `ruleSetVersion` used

---

## 9. Review Gate Answers

| Question                                                                      | Answer                                                                                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can one shift require multiple workers?                                       | Yes. `requiredWorkerCount` field. Shift is PARTIALLY_FILLED until all slots confirmed.                                                                         |
| Who can confirm an assignment?                                                | Configurable per tenant/facility: scheduler, client, or auto-policy engine.                                                                                    |
| Is eligibility evaluated at marketplace, request, confirmation, and clock-in? | Yes, at all four points. Each is a separate evaluation with its own record.                                                                                    |
| What happens if credentials expire after assignment but before shift?         | Assignment CANCELLED; slot reopens; worker and scheduler notified.                                                                                             |
| What geofence evidence is retained?                                           | Coordinates, distance, facility coordinates, radius, and withinFence boolean. Stored per clock event.                                                          |
| How are overnight shifts represented?                                         | UTC start/end times; `businessDate` for the shift's calendar date; facility timezone for display and daily OT.                                                 |
| How are timezone/DST transitions handled?                                     | All times stored UTC. Facility timezone used for display and daily OT boundary calculation. DST transitions use the timezone rules at the moment of the event. |
| How are breaks corrected?                                                     | Admin creates a corrected timecard (version++); re-enters approval flow. Original version preserved.                                                           |
| Can clients approve in bulk?                                                  | Yes. Same approve endpoint called per timecard. Batch endpoint deferred to post-pilot.                                                                         |
| How are rejected timecards corrected?                                         | REJECTED → admin corrects → CORRECTED → re-SUBMITTED → CLIENT_REVIEW again.                                                                                    |
| How are rate rules versioned?                                                 | PayRule and BillRule have a version field. Calculations store which version was used.                                                                          |
| How are cancellations/no-shows represented?                                   | Assignment status: CANCELLED (with reason and cancelledBy) or NO_SHOW. Shift slot reopens.                                                                     |
| What is compared against Symplr in shadow mode?                               | Eligibility decisions, shift lifecycle states, timecard hours, pay/bill line items, and exception flags.                                                       |
| Which API fields contain PHI/PII/financial?                                   | Marked with `description: "CONFIDENTIAL"` or `"RESTRICTED"` in schema. Worker name, email, phone, SSN (never in API), license numbers, pay amounts.            |
