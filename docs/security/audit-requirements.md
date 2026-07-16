# CareCareer — Audit Requirements

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Audit Record Structure

Every audit record is append-only and immutable. No update or delete operations
are permitted on audit data.

```json
{
  "auditId": "019...",
  "tenantId": "019...",
  "actor": {
    "id": "019...",
    "type": "user",
    "roles": ["TIMECARD_APPROVER"],
    "ipAddress": "192.168.1.100",
    "userAgent": "CareCareer-Mobile/1.0",
    "deviceId": "hashed-device-id"
  },
  "impersonator": null,
  "action": "timecards:approve",
  "resourceType": "timecard",
  "resourceId": "019...",
  "before": { "status": "CLIENT_REVIEW" },
  "after": { "status": "APPROVED", "approvedBy": "019..." },
  "outcome": "SUCCESS",
  "reason": null,
  "timestamp": "2026-07-16T14:00:00Z",
  "correlationId": "019...",
  "causationEventId": null,
  "policyVersion": "2026-07-16-001",
  "calculationVersion": null,
  "legacySyncRef": null,
  "dataClassification": "confidential",
  "retentionClass": "STANDARD"
}
```

---

## 2. Required Audit Fields

| Field              | Required        | Description                                             |
| ------------------ | --------------- | ------------------------------------------------------- |
| auditId            | Yes             | Unique identifier for this audit record                 |
| tenantId           | Yes             | Owning tenant                                           |
| actor.id           | Yes             | Who performed the action                                |
| actor.type         | Yes             | user, service, agent, system                            |
| actor.roles        | Yes             | Roles at time of action                                 |
| actor.ipAddress    | When available  | Source IP (HTTP requests)                               |
| actor.userAgent    | When available  | Client identifier                                       |
| actor.deviceId     | When available  | Hashed device ID (mobile)                               |
| impersonator       | When applicable | If action performed under delegation/break-glass        |
| action             | Yes             | Permission string (e.g., timecards:approve)             |
| resourceType       | Yes             | Entity type affected                                    |
| resourceId         | Yes             | Entity ID affected                                      |
| before             | When applicable | Previous state summary (not full record for RESTRICTED) |
| after              | When applicable | New state summary                                       |
| outcome            | Yes             | SUCCESS, DENIED, FAILED, ERROR                          |
| reason             | When applicable | Denial reason or failure cause                          |
| timestamp          | Yes             | UTC ISO 8601                                            |
| correlationId      | Yes             | Request correlation for tracing                         |
| causationEventId   | When applicable | Domain event that caused this action                    |
| policyVersion      | When applicable | Authorization policy version used                       |
| calculationVersion | When applicable | Financial calculation version                           |
| legacySyncRef      | When applicable | External system reference for migration actions         |
| dataClassification | Yes             | Classification of the action/data                       |
| retentionClass     | Yes             | Determines retention duration                           |

---

## 3. Actions Requiring Audit

### Standard Audit (All Mutations)

Every successful state change produces an audit record:

- Resource creation
- Resource update (with before/after)
- Resource deletion (soft-delete with reason)
- Status transitions

### Enhanced Audit (Compliance-Critical)

These actions require enhanced audit with extended retention:

| Category      | Actions                                                |
| ------------- | ------------------------------------------------------ |
| Credentials   | Add, verify, reject, expire, revoke, renew             |
| Eligibility   | Every evaluation (eligible and ineligible)             |
| Assignments   | Create, confirm, cancel, no-show                       |
| Timecards     | Submit, approve, reject, correct                       |
| Financial     | Calculate, export-preview, export                      |
| Authorization | Permission denied, role change, break-glass activation |
| Identity      | User create, invite, deactivate, role assignment       |
| Tenant        | Provisioning, suspension, configuration change         |
| Data access   | RESTRICTED field access, cross-tenant access           |
| Migration     | Legacy import, reconciliation exception                |

### Denied Action Audit

Every DENIED authorization decision is audited:

- Actor, requested action, resource, denial reason, policy version

---

## 4. Retention Requirements

| Retention Class | Duration   | Applies To                                     |
| --------------- | ---------- | ---------------------------------------------- |
| STANDARD        | 3 years    | General operational audit                      |
| ENHANCED        | 7 years    | Financial, compliance, credential, eligibility |
| REGULATORY      | 10 years   | HIPAA-related, adverse actions, legal holds    |
| PERMANENT       | Indefinite | Security incidents, legal holds                |

---

## 5. Storage

### Primary Store

- PostgreSQL append-only table (same database, separate schema)
- RLS enabled (tenant-scoped queries)
- No UPDATE or DELETE permissions for application role
- Indexed by: tenantId, resourceType, resourceId, actor.id, timestamp

### Archive Store

- S3 with Glacier lifecycle (after 90 days)
- Partitioned by tenant and month
- Encrypted (SSE-KMS)
- Immutable (Object Lock in compliance mode for REGULATORY class)

---

## 6. Query and Access

- **Operations:** Query by correlationId, resourceId, actor, time range
- **Compliance:** Query by tenant, resource type, time range, outcome
- **Investigation:** Full-text search on reason/action fields
- **Export:** Tenant-scoped export for customer audit packages
- **Access control:** Audit query requires `audit:read` permission
- **Read-only:** No mutation endpoints exist for audit data

---

## 7. Before/After State Rules

| Data Classification | Before/After Behavior                                   |
| ------------------- | ------------------------------------------------------- |
| PUBLIC / INTERNAL   | Full before/after snapshot                              |
| CONFIDENTIAL        | Summary only (changed fields, not values of all fields) |
| RESTRICTED          | Field names only (e.g., "ssn was updated"); no values   |

RESTRICTED field values MUST NOT appear in audit records. Record that the
field was accessed or changed, not the value itself.

---

## 8. Impersonation and Break-Glass

When an action is performed under break-glass or impersonation:

```json
{
  "actor": { "id": "admin-user-id", "type": "user" },
  "impersonator": {
    "id": "platform-admin-id",
    "reason": "Support ticket #12345 — client unable to approve timecard",
    "elevationType": "BREAK_GLASS",
    "expiresAt": "2026-07-16T18:00:00Z",
    "approvedBy": "security-lead-id"
  }
}
```
