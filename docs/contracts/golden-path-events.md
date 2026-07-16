# CareCareer — Golden Path Event Catalog

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Standard Event Envelope

Every domain event uses this envelope. No exceptions.

```json
{
  "eventId": "019...",
  "eventType": "carecareer.shift.published.v1",
  "eventVersion": 1,
  "occurredAt": "2026-07-16T18:00:00Z",
  "tenantId": "019...",
  "aggregateType": "shift",
  "aggregateId": "019...",
  "aggregateVersion": 3,
  "correlationId": "019...",
  "causationId": "019...",
  "actor": {
    "type": "user",
    "id": "019..."
  },
  "source": "staffing-service",
  "dataClassification": "internal",
  "data": {}
}
```

### Envelope Rules

- `eventId`: UUID v7, globally unique, used for deduplication
- `eventType`: `carecareer.<entity>.<past-tense-verb>.v<major>`
- `eventVersion`: Integer, increments on backward-incompatible payload changes
- `occurredAt`: UTC ISO 8601 timestamp of when the business event occurred
- `tenantId`: Always present; extracted from aggregate context
- `aggregateVersion`: Optimistic version of the aggregate after this event
- `correlationId`: Trace across the entire user action (from HTTP request)
- `causationId`: The eventId that caused this event (null if triggered by user)
- `source`: Publishing service name
- `dataClassification`: `public | internal | confidential | restricted`
- `data`: Event-specific payload (see below)

---

## 2. Event Catalog — Workforce Domain

### carecareer.worker.created.v1

| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Producer          | workforce-service                                                     |
| Consumers         | staffing-service (update matching pool), identity-service (link user) |
| Trigger           | Worker registered via API or migration seed                           |
| Ordering          | Per workerId                                                          |
| Deduplication key | eventId                                                               |
| Retry policy      | Exponential backoff, max 5 retries                                    |
| DLQ behavior      | Route to workforce-dlq; alert operations                              |
| Retention         | 90 days in queue; permanent in audit                                  |
| Audit event       | Yes                                                                   |
| Integration event | No                                                                    |
| Sensitive fields  | `data.email` (CONFIDENTIAL), `data.phone` (CONFIDENTIAL)              |

**Payload:**

```json
{
  "workerId": "019...",
  "displayId": "CC-W-2026-00142",
  "firstName": "Jane",
  "lastName": "D.",
  "status": "APPLICANT",
  "roles": ["RN"]
}
```

### carecareer.worker.updated.v1

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Producer          | workforce-service                                    |
| Consumers         | staffing-service (re-evaluate matches)               |
| Trigger           | Worker profile updated                               |
| Ordering          | Per workerId                                         |
| Deduplication key | eventId                                              |
| Sensitive fields  | `data.changedFields` may reference CONFIDENTIAL data |

**Payload:**

```json
{
  "workerId": "019...",
  "changedFields": ["maxCommuteMiles", "preferredFacilities"],
  "previousVersion": 2,
  "newVersion": 3
}
```

### carecareer.credential.added.v1

| Field            | Value                                      |
| ---------------- | ------------------------------------------ |
| Producer         | workforce-service                          |
| Consumers        | staffing-service (re-evaluate eligibility) |
| Trigger          | Credential submitted for a worker          |
| Ordering         | Per workerId                               |
| Sensitive fields | `data.licenseNumber` (CONFIDENTIAL)        |

**Payload:**

```json
{
  "credentialId": "019...",
  "workerId": "019...",
  "credentialTypeCode": "RN_LICENSE",
  "status": "UPLOADED",
  "expiresAt": "2027-03-15"
}
```

### carecareer.credential.verified.v1

| Field     | Value                                          |
| --------- | ---------------------------------------------- |
| Producer  | workforce-service                              |
| Consumers | staffing-service (worker may become eligible)  |
| Trigger   | Credential verification completed successfully |
| Ordering  | Per workerId                                   |

**Payload:**

```json
{
  "credentialId": "019...",
  "workerId": "019...",
  "credentialTypeCode": "RN_LICENSE",
  "verifiedAt": "2026-07-16T14:00:00Z",
  "expiresAt": "2027-03-15"
}
```

### carecareer.credential.rejected.v1

| Field     | Value                          |
| --------- | ------------------------------ |
| Producer  | workforce-service              |
| Consumers | notification (inform worker)   |
| Trigger   | Credential verification failed |
| Ordering  | Per workerId                   |

**Payload:**

```json
{
  "credentialId": "019...",
  "workerId": "019...",
  "credentialTypeCode": "BLS_CERT",
  "rejectionReason": "Document illegible; unable to verify"
}
```

### carecareer.credential.expired.v1

| Field        | Value                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| Producer     | workforce-service (scheduled job)                                      |
| Consumers    | staffing-service (cancel affected shifts), notification (alert worker) |
| Trigger      | Daily expiration check detects expired credential                      |
| Ordering     | Per workerId                                                           |
| DLQ behavior | Critical — alert immediately; credential blocking depends on this      |

**Payload:**

```json
{
  "credentialId": "019...",
  "workerId": "019...",
  "credentialTypeCode": "RN_LICENSE",
  "expiredAt": "2026-07-15",
  "affectedAssignments": ["019...", "019..."]
}
```

### carecareer.eligibility.evaluated.v1

| Field     | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Producer  | workforce-service                                             |
| Consumers | audit (compliance record), reconciliation (shadow comparison) |
| Trigger   | Eligibility evaluation performed                              |
| Ordering  | Per workerId + facilityId                                     |

**Payload:**

```json
{
  "evaluationId": "019...",
  "workerId": "019...",
  "facilityId": "019...",
  "shiftId": "019...",
  "evaluationPoint": "REQUEST_SUBMISSION",
  "result": "ELIGIBLE",
  "reasons": [{ "code": "CREDENTIAL_VALID", "credentialTypeCode": "RN_LICENSE" }]
}
```

### carecareer.worker.blocked.v1

| Field       | Value                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Producer    | workforce-service                                                            |
| Consumers   | staffing-service (remove from pool, cancel shifts), notification (alert ops) |
| Trigger     | Credential expiry, OIG/SAM exclusion, compliance failure                     |
| Ordering    | Per workerId                                                                 |
| Audit event | Yes (compliance-critical)                                                    |

**Payload:**

```json
{
  "workerId": "019...",
  "reason": "CREDENTIAL_EXPIRED",
  "credentialTypeCode": "RN_LICENSE",
  "blockedAt": "2026-07-16T00:00:00Z"
}
```

### carecareer.worker.unblocked.v1

| Field       | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| Producer    | workforce-service                                                   |
| Consumers   | staffing-service (add back to matching pool)                        |
| Trigger     | Blocking condition resolved (credential renewed, exclusion cleared) |
| Ordering    | Per workerId                                                        |
| Audit event | Yes                                                                 |

**Payload:**

```json
{
  "workerId": "019...",
  "reason": "CREDENTIAL_RENEWED",
  "unblockedAt": "2026-07-16T10:00:00Z"
}
```

---

## 3. Event Catalog — Staffing Domain

### carecareer.facility.created.v1

| Field     | Value                                                     |
| --------- | --------------------------------------------------------- |
| Producer  | staffing-service                                          |
| Consumers | workforce-service (eligibility reference), reconciliation |
| Trigger   | Facility created or seeded                                |
| Ordering  | Per facilityId                                            |

**Payload:**

```json
{
  "facilityId": "019...",
  "name": "Memorial Hospital ICU",
  "timezone": "America/New_York",
  "geofenceRadiusMeters": 200,
  "coordinates": { "latitude": 40.7128, "longitude": -74.006 }
}
```

### carecareer.shift.created.v1

| Field     | Value                        |
| --------- | ---------------------------- |
| Producer  | staffing-service             |
| Consumers | audit                        |
| Trigger   | Shift created (DRAFT status) |
| Ordering  | Per shiftId                  |

**Payload:**

```json
{
  "shiftId": "019...",
  "facilityId": "019...",
  "departmentId": "019...",
  "role": "RN",
  "startTime": "2026-07-20T19:00:00Z",
  "endTime": "2026-07-21T07:00:00Z",
  "requiredWorkerCount": 2,
  "status": "DRAFT"
}
```

### carecareer.shift.published.v1

| Field     | Value                                                    |
| --------- | -------------------------------------------------------- |
| Producer  | staffing-service                                         |
| Consumers | notification (push to eligible workers), matching engine |
| Trigger   | Shift published to marketplace                           |
| Ordering  | Per shiftId                                              |

**Payload:**

```json
{
  "shiftId": "019...",
  "facilityId": "019...",
  "role": "RN",
  "startTime": "2026-07-20T19:00:00Z",
  "endTime": "2026-07-21T07:00:00Z",
  "requiredWorkerCount": 2,
  "payRate": { "amount": "45.00", "currency": "USD" }
}
```

### carecareer.shift.cancelled.v1

| Field     | Value                                                                           |
| --------- | ------------------------------------------------------------------------------- |
| Producer  | staffing-service                                                                |
| Consumers | notification (inform assigned workers), time-finance (cancel pending timecards) |
| Trigger   | Shift cancelled by client, scheduler, or system                                 |
| Ordering  | Per shiftId                                                                     |

**Payload:**

```json
{
  "shiftId": "019...",
  "reason": "Client no longer needs coverage",
  "cancelledBy": "CLIENT",
  "affectedAssignments": ["019...", "019..."]
}
```

### carecareer.shift-request.created.v1

| Field     | Value                                  |
| --------- | -------------------------------------- |
| Producer  | staffing-service                       |
| Consumers | notification (inform scheduler), audit |
| Trigger   | Worker requests a shift                |
| Ordering  | Per shiftId                            |

**Payload:**

```json
{
  "requestId": "019...",
  "shiftId": "019...",
  "workerId": "019...",
  "eligibilityEvaluationId": "019...",
  "eligibilityResult": "ELIGIBLE"
}
```

### carecareer.shift-request.confirmed.v1

| Field       | Value                                                          |
| ----------- | -------------------------------------------------------------- |
| Producer    | staffing-service                                               |
| Consumers   | notification (inform worker), time-finance (prepare for clock) |
| Trigger     | Scheduler, client, or policy confirms request                  |
| Ordering    | Per shiftId                                                    |
| Audit event | Yes                                                            |

**Payload:**

```json
{
  "requestId": "019...",
  "shiftId": "019...",
  "workerId": "019...",
  "assignmentId": "019...",
  "confirmedBy": "019..."
}
```

### carecareer.shift-request.rejected.v1

| Field     | Value                               |
| --------- | ----------------------------------- |
| Producer  | staffing-service                    |
| Consumers | notification (inform worker)        |
| Trigger   | Scheduler or client rejects request |
| Ordering  | Per shiftId                         |

**Payload:**

```json
{
  "requestId": "019...",
  "shiftId": "019...",
  "workerId": "019...",
  "reason": "Position filled by another worker"
}
```

### carecareer.assignment.created.v1

| Field       | Value                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| Producer    | staffing-service                                                           |
| Consumers   | time-finance-service (prepare timecard template), notification (reminders) |
| Trigger     | Shift request confirmed → assignment created                               |
| Ordering    | Per assignmentId                                                           |
| Audit event | Yes                                                                        |

**Payload:**

```json
{
  "assignmentId": "019...",
  "shiftId": "019...",
  "workerId": "019...",
  "facilityId": "019...",
  "scheduledStart": "2026-07-20T19:00:00Z",
  "scheduledEnd": "2026-07-21T07:00:00Z"
}
```

### carecareer.assignment.cancelled.v1

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Producer  | staffing-service                                      |
| Consumers | notification (inform parties), staffing (reopen slot) |
| Trigger   | Assignment cancelled or no-show                       |
| Ordering  | Per assignmentId                                      |

**Payload:**

```json
{
  "assignmentId": "019...",
  "shiftId": "019...",
  "workerId": "019...",
  "reason": "Worker called off",
  "cancelledBy": "WORKER",
  "reopenSlot": true
}
```

---

## 4. Event Catalog — Time & Finance Domain

### carecareer.clock-event.recorded.v1

| Field             | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| Producer          | time-finance-service                                          |
| Consumers         | audit, reconciliation                                         |
| Trigger           | Clock event accepted and stored                               |
| Ordering          | Per assignmentId + timestamp                                  |
| Deduplication key | deviceEventId (for offline dedup) + eventId (for queue dedup) |
| Sensitive fields  | `data.coordinates` (location data)                            |

**Payload:**

```json
{
  "clockEventId": "019...",
  "assignmentId": "019...",
  "workerId": "019...",
  "type": "CLOCK_IN",
  "timestamp": "2026-07-20T18:55:00Z",
  "geofenceResult": { "withinFence": true, "distanceMeters": 45 },
  "offlineSubmitted": false
}
```

### carecareer.clock-event.rejected.v1

| Field     | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Producer  | time-finance-service                                          |
| Consumers | notification (inform worker why), audit                       |
| Trigger   | Clock event fails validation (geofence, sequence, credential) |
| Ordering  | Per assignmentId                                              |

**Payload:**

```json
{
  "assignmentId": "019...",
  "workerId": "019...",
  "type": "CLOCK_IN",
  "rejectionReason": "GEOFENCE_VALIDATION_FAILED",
  "distanceMeters": 1250,
  "allowedRadiusMeters": 200
}
```

### carecareer.timecard.generated.v1

| Field     | Value                                                       |
| --------- | ----------------------------------------------------------- |
| Producer  | time-finance-service                                        |
| Consumers | notification (inform worker to review)                      |
| Trigger   | Timecard generated from clock events after shift completion |
| Ordering  | Per timecardId                                              |

**Payload:**

```json
{
  "timecardId": "019...",
  "assignmentId": "019...",
  "workerId": "019...",
  "totalMinutesWorked": 690,
  "totalBreakMinutes": 30,
  "exceptionCount": 0,
  "status": "GENERATED"
}
```

### carecareer.timecard.submitted.v1

| Field     | Value                                          |
| --------- | ---------------------------------------------- |
| Producer  | time-finance-service                           |
| Consumers | notification (inform client/approver)          |
| Trigger   | Worker or system submits timecard for approval |
| Ordering  | Per timecardId                                 |

**Payload:**

```json
{
  "timecardId": "019...",
  "workerId": "019...",
  "facilityId": "019...",
  "status": "SUBMITTED"
}
```

### carecareer.timecard.approved.v1

| Field       | Value                                                            |
| ----------- | ---------------------------------------------------------------- |
| Producer    | time-finance-service                                             |
| Consumers   | payroll-prep (trigger calculation), notification (inform worker) |
| Trigger     | Client or internal approver approves timecard                    |
| Ordering    | Per timecardId                                                   |
| Audit event | Yes (financial gate)                                             |

**Payload:**

```json
{
  "timecardId": "019...",
  "workerId": "019...",
  "approvedBy": "019...",
  "approvedAt": "2026-07-22T14:00:00Z",
  "totalMinutesWorked": 690,
  "version": 1
}
```

### carecareer.timecard.rejected.v1

| Field     | Value                              |
| --------- | ---------------------------------- |
| Producer  | time-finance-service               |
| Consumers | notification (inform worker/admin) |
| Trigger   | Client rejects timecard            |
| Ordering  | Per timecardId                     |

**Payload:**

```json
{
  "timecardId": "019...",
  "rejectedBy": "019...",
  "reason": "Hours do not match — worker left early",
  "status": "REJECTED"
}
```

### carecareer.calculation.completed.v1

| Field            | Value                                          |
| ---------------- | ---------------------------------------------- |
| Producer         | time-finance-service                           |
| Consumers        | reconciliation (compare against Symplr), audit |
| Trigger          | Pay or bill calculation completed              |
| Ordering         | Per timecardId                                 |
| Audit event      | Yes (financial)                                |
| Sensitive fields | `data.totalAmount` (CONFIDENTIAL)              |

**Payload:**

```json
{
  "calculationId": "019...",
  "timecardId": "019...",
  "type": "PAY",
  "totalAmount": "517.50",
  "currency": "USD",
  "lineItemCount": 3,
  "ruleSetVersion": 2,
  "timecardVersion": 1
}
```

### carecareer.calculation.failed.v1

| Field     | Value                                                   |
| --------- | ------------------------------------------------------- |
| Producer  | time-finance-service                                    |
| Consumers | notification (alert ops), audit                         |
| Trigger   | Calculation cannot complete (missing rules, data error) |
| Ordering  | Per timecardId                                          |

**Payload:**

```json
{
  "timecardId": "019...",
  "type": "PAY",
  "failureReason": "PAY_RULE_NOT_FOUND",
  "message": "No pay rule defined for RN at facility FAC-001 with night differential"
}
```

### carecareer.export-preview.generated.v1

| Field     | Value                                               |
| --------- | --------------------------------------------------- |
| Producer  | time-finance-service                                |
| Consumers | reconciliation (compare against Symplr export)      |
| Trigger   | Export preview generated for Paycom/NetSuite format |
| Ordering  | Per calculationId                                   |

**Payload:**

```json
{
  "calculationId": "019...",
  "exportFormat": "PAYCOM",
  "status": "PREVIEW",
  "recordCount": 1
}
```

---

## 5. Event Catalog — Migration & Reconciliation

### carecareer.legacy-record.imported.v1

| Field             | Value                                |
| ----------------- | ------------------------------------ |
| Producer          | migration adapters                   |
| Consumers         | audit                                |
| Trigger           | Legacy record seeded into CareCareer |
| Ordering          | Per entityType + entityId            |
| Integration event | Yes                                  |

**Payload:**

```json
{
  "entityType": "worker",
  "entityId": "019...",
  "sourceSystem": "symplr",
  "externalId": "SP-12345",
  "importedFields": ["firstName", "lastName", "status", "credentials"]
}
```

### carecareer.legacy-sync.failed.v1

| Field     | Value                         |
| --------- | ----------------------------- |
| Producer  | migration adapters            |
| Consumers | operations dashboard, alert   |
| Trigger   | Sync from legacy system fails |
| Ordering  | None                          |

**Payload:**

```json
{
  "sourceSystem": "symplr",
  "entityType": "credential",
  "externalId": "CRED-99",
  "failureReason": "Connection timeout to replicated database",
  "retryCount": 3
}
```

### carecareer.reconciliation.completed.v1

| Field     | Value                        |
| --------- | ---------------------------- |
| Producer  | reconciliation service       |
| Consumers | audit, operations dashboard  |
| Trigger   | Reconciliation run completes |
| Ordering  | Per runId                    |

**Payload:**

```json
{
  "runId": "019...",
  "domain": "PAY_CALCULATION",
  "totalRecords": 142,
  "matchedRecords": 142,
  "mismatchedRecords": 0,
  "matchRate": 1.0
}
```

### carecareer.reconciliation.exception-detected.v1

| Field     | Value                                   |
| --------- | --------------------------------------- |
| Producer  | reconciliation service                  |
| Consumers | operations alert, audit                 |
| Trigger   | Mismatch detected during reconciliation |
| Ordering  | Per runId                               |

**Payload:**

```json
{
  "runId": "019...",
  "domain": "TIMECARD_HOURS",
  "entityType": "timecard",
  "entityId": "019...",
  "field": "totalMinutesWorked",
  "carecareerValue": "690",
  "legacyValue": "720",
  "severity": "HIGH"
}
```

---

## 6. Event Infrastructure Rules

1. **Producers MUST use a transactional outbox** — event written in same DB transaction as state change.
2. **Consumers MUST be idempotent** — use inbox pattern or eventId deduplication.
3. **Events are immutable** — once published, never modified.
4. **Schemas are backward-compatible within a major version** — new fields are optional.
5. **Sensitive data is minimized** — reference IDs rather than replicate PII/PHI.
6. **CareCareer events are isolated from legacy Kafka topics** — adapters translate between them.
7. **Every event is an audit record** — stored in append-only audit table.
8. **DLQ events are monitored and alerted** — never silently discarded.
9. **Replay MUST be safe** — consumers handle duplicate delivery gracefully.
10. **Ordering is guaranteed per-aggregate** — not globally across all events.
