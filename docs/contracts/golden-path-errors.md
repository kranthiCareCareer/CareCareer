# CareCareer — Golden Path Error Taxonomy

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Error Envelope

Every error response uses this structure. No Prisma, database, queue, or vendor
errors are ever exposed to clients.

```json
{
  "error": {
    "code": "WORKER_NOT_ELIGIBLE",
    "message": "The worker is not eligible for this shift.",
    "correlationId": "019...",
    "requestId": "019...",
    "timestamp": "2026-07-16T18:00:00Z",
    "details": [
      {
        "reason": "CREDENTIAL_EXPIRED",
        "credentialTypeCode": "RN_LICENSE",
        "expiredAt": "2026-07-01",
        "field": null,
        "context": {}
      }
    ]
  }
}
```

### Rules

- `code`: Stable machine-readable identifier (never changes once published)
- `message`: Human-readable; may be internationalized later
- `correlationId`: From request header; ties to distributed trace
- `requestId`: Server-generated per request
- `details`: Array of structured reasons (for multi-reason errors like eligibility)
- Internal errors (500) include correlationId but NEVER stack traces, SQL, or vendor info

---

## 2. HTTP Status Code Mapping

| Status | Meaning               | When Used                                             |
| ------ | --------------------- | ----------------------------------------------------- |
| 400    | Bad Request           | Validation failure, malformed input                   |
| 401    | Unauthorized          | Missing or invalid authentication                     |
| 403    | Forbidden             | Authenticated but lacks permission                    |
| 404    | Not Found             | Entity does not exist in tenant scope                 |
| 409    | Conflict              | Version conflict, idempotency conflict, duplicate     |
| 422    | Unprocessable         | Business rule violation (valid format, invalid state) |
| 429    | Too Many Requests     | Rate limit exceeded                                   |
| 500    | Internal Server Error | Unexpected failure (never exposes internals)          |
| 503    | Service Unavailable   | Dependency down, circuit open                         |

---

## 3. Error Code Catalog

### 3.1 Platform & Tenancy

| Code                    | HTTP | Description                                           | Audit |
| ----------------------- | ---- | ----------------------------------------------------- | ----- |
| TENANT_CONTEXT_REQUIRED | 400  | Request missing tenant context (JWT has no tenantId)  | No    |
| TENANT_ACCESS_DENIED    | 403  | User does not belong to this tenant                   | Yes   |
| TENANT_INACTIVE         | 403  | Tenant is suspended or deactivated                    | Yes   |
| ENTITLEMENT_REQUIRED    | 403  | Tenant lacks entitlement for this module/feature      | No    |
| RESOURCE_NOT_FOUND      | 404  | Requested resource does not exist within tenant scope | No    |
| VERSION_CONFLICT        | 409  | Optimistic concurrency conflict (stale version)       | No    |
| IDEMPOTENCY_CONFLICT    | 409  | Same idempotency key with different payload           | No    |
| RATE_LIMIT_EXCEEDED     | 429  | Too many requests from this actor                     | No    |

### 3.2 Authorization

| Code                    | HTTP | Description                                      | Audit |
| ----------------------- | ---- | ------------------------------------------------ | ----- |
| AUTHENTICATION_REQUIRED | 401  | No valid token provided                          | No    |
| TOKEN_EXPIRED           | 401  | JWT has expired                                  | No    |
| TOKEN_INVALID           | 401  | JWT signature invalid or malformed               | Yes   |
| PERMISSION_DENIED       | 403  | User lacks required permission for this action   | Yes   |
| ROLE_ASSIGNMENT_INVALID | 422  | Role cannot be assigned (conflicts, hierarchy)   | No    |
| POLICY_CONDITION_FAILED | 403  | ABAC policy condition not met (branch, facility) | Yes   |

### 3.3 Workforce & Credentials

| Code                         | HTTP | Description                                         | Audit |
| ---------------------------- | ---- | --------------------------------------------------- | ----- |
| WORKER_NOT_FOUND             | 404  | Worker does not exist in tenant                     | No    |
| WORKER_NOT_ACTIVE            | 422  | Worker status is not ACTIVE or READY                | No    |
| WORKER_NOT_ELIGIBLE          | 422  | Worker fails eligibility evaluation                 | Yes   |
| WORKER_BLOCKED               | 422  | Worker is blocked (credential/compliance)           | Yes   |
| CREDENTIAL_REQUIRED          | 422  | Required credential missing for this facility/role  | No    |
| CREDENTIAL_EXPIRED           | 422  | Credential has expired                              | Yes   |
| CREDENTIAL_NOT_VERIFIED      | 422  | Credential exists but not yet verified              | No    |
| CREDENTIAL_ALREADY_EXISTS    | 409  | Duplicate credential submission                     | No    |
| FACILITY_REQUIREMENT_NOT_MET | 422  | Worker does not meet facility-specific requirements | Yes   |
| OIG_EXCLUSION                | 422  | Worker on OIG exclusion list                        | Yes   |
| SAM_EXCLUSION                | 422  | Worker on SAM.gov debarment list                    | Yes   |

### 3.4 Scheduling

| Code                          | HTTP | Description                                             | Audit |
| ----------------------------- | ---- | ------------------------------------------------------- | ----- |
| SHIFT_NOT_FOUND               | 404  | Shift does not exist in tenant                          | No    |
| SHIFT_NOT_AVAILABLE           | 422  | Shift is not in a requestable state                     | No    |
| SHIFT_ALREADY_FILLED          | 422  | All worker slots are confirmed                          | No    |
| SHIFT_NOT_PUBLISHED           | 422  | Shift must be PUBLISHED to accept requests              | No    |
| SHIFT_OVERLAP                 | 422  | Shift times overlap with another shift (creation)       | No    |
| SHIFT_IN_PAST                 | 422  | Cannot create/publish shift with start time in the past | No    |
| SHIFT_REQUEST_DUPLICATE       | 409  | Worker already has a pending request for this shift     | No    |
| WORKER_UNAVAILABLE            | 422  | Worker has a scheduling conflict                        | No    |
| ASSIGNMENT_CONFLICT           | 422  | Worker already assigned to overlapping shift            | No    |
| ASSIGNMENT_NOT_FOUND          | 404  | Assignment does not exist                               | No    |
| INVALID_STATE_TRANSITION      | 422  | Requested transition not allowed from current state     | No    |
| CONFIRMATION_AUTHORITY_DENIED | 403  | Actor cannot confirm assignments for this facility      | Yes   |

### 3.5 Timekeeping

| Code                            | HTTP | Description                                             | Audit |
| ------------------------------- | ---- | ------------------------------------------------------- | ----- |
| CLOCK_EVENT_OUT_OF_SEQUENCE     | 422  | e.g., CLOCK_OUT without prior CLOCK_IN                  | No    |
| CLOCK_IN_OUTSIDE_ALLOWED_WINDOW | 422  | Too early or too late for the scheduled shift           | No    |
| GEOFENCE_VALIDATION_FAILED      | 422  | Worker not within facility geofence radius              | Yes   |
| BREAK_ALREADY_ACTIVE            | 422  | BREAK_START when already on break                       | No    |
| CLOCK_OUT_BEFORE_CLOCK_IN       | 422  | Timestamp ordering violation                            | No    |
| CLOCK_EVENT_DUPLICATE           | 409  | deviceEventId already processed (offline dedup)         | No    |
| TIMECARD_ALREADY_SUBMITTED      | 422  | Timecard already in approval flow                       | No    |
| TIMECARD_ALREADY_APPROVED       | 422  | Cannot modify an approved timecard (use correction)     | No    |
| TIMECARD_APPROVAL_CONFLICT      | 409  | Concurrent approval attempt                             | No    |
| TIMECARD_NOT_IN_REVIEW          | 422  | Timecard not in a state that accepts approval/rejection | No    |

### 3.6 Finance

| Code                            | HTTP | Description                                                | Audit |
| ------------------------------- | ---- | ---------------------------------------------------------- | ----- |
| PAY_RULE_NOT_FOUND              | 422  | No pay rule matches this worker/facility/role combination  | Yes   |
| BILL_RULE_NOT_FOUND             | 422  | No bill rule matches this client/facility/role combination | Yes   |
| CALCULATION_INPUT_INCOMPLETE    | 422  | Timecard or rule data insufficient for calculation         | No    |
| CALCULATION_VERSION_CONFLICT    | 409  | Timecard was corrected; recalculate with new version       | No    |
| CALCULATION_ALREADY_COMPLETED   | 409  | Calculation already exists for this timecard version       | No    |
| FINANCIAL_RECONCILIATION_FAILED | 422  | Reconciliation threshold not met                           | Yes   |
| EXPORT_FORMAT_INVALID           | 422  | Cannot produce valid export in requested format            | No    |

### 3.7 Migration & Reconciliation

| Code                            | HTTP | Description                                               | Audit |
| ------------------------------- | ---- | --------------------------------------------------------- | ----- |
| EXTERNAL_REFERENCE_CONFLICT     | 409  | External ID already mapped to different CareCareer entity | Yes   |
| EXTERNAL_REFERENCE_NOT_FOUND    | 404  | No mapping exists for this external system + ID           | No    |
| LEGACY_RECORD_NOT_FOUND         | 404  | Referenced record not found in legacy system              | No    |
| LEGACY_SYNC_FAILED              | 500  | Cannot communicate with legacy system                     | No    |
| RECONCILIATION_THRESHOLD_FAILED | 422  | Reconciliation results below required threshold           | Yes   |
| RECONCILIATION_IN_PROGRESS      | 409  | A run is already executing for this domain/period         | No    |

---

## 4. Error Traceability

Errors affecting credentials, access, pay, or compliance are marked `Audit: Yes`
and MUST:

1. Be recorded in the immutable audit log with full context
2. Include the correlationId for cross-service tracing
3. Include the actor (userId, role, tenant) who triggered the action
4. Include the before/after state where applicable
5. Be queryable by compliance officers for investigation

This aligns with MAS security requirements for accountability, monitoring,
access control, and incident records.

---

## 5. Internal Error Handling

Internal errors (500) MUST:

- Log full stack trace, query, and context to structured logs (NEVER to client)
- Return only `correlationId`, generic message, and timestamp to client
- Alert operations if error rate exceeds threshold
- Never expose: database errors, Prisma messages, queue failures, vendor API responses
