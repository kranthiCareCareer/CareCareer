# CareCareer — Authorization Model

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Model Overview

CareCareer uses **RBAC + ABAC** (Role-Based + Attribute-Based Access Control).

- **RBAC** defines base capabilities per role.
- **ABAC** refines access using context attributes (tenant, branch, facility, etc.).
- **Authorization is separate from authentication.** The IdP authenticates; CareCareer authorizes.

---

## 2. Subjects

| Subject Type | Description                                          | Identity Source                              |
| ------------ | ---------------------------------------------------- | -------------------------------------------- |
| User         | Human actor (admin, recruiter, client, worker)       | OIDC subject mapped to CareCareer user ID    |
| Service      | Backend service acting on behalf of a user or system | Service identity (mTLS or signed token)      |
| Agent        | AI agent acting within policy boundaries             | Agent identity with tool-scoped permissions  |
| System       | Automated process (scheduled job, migration)         | System identity with explicit tenant context |

---

## 3. Tenant Membership

- Every user belongs to exactly one tenant (primary membership).
- A user MAY have access to multiple branches within their tenant.
- Cross-tenant membership is prohibited (separate user records per tenant).
- Platform admins use a separate elevated identity path (not tenant-scoped).

---

## 4. Roles

### Golden-Path Roles (Pilot)

| Role                     | Scope           | Primary Use                                      |
| ------------------------ | --------------- | ------------------------------------------------ |
| PLATFORM_ADMIN           | Platform-wide   | CareCareer internal operations                   |
| TENANT_ADMIN             | Tenant          | Tenant configuration, user management            |
| SCHEDULER                | Branch/Facility | Shift creation, assignment confirmation          |
| RECRUITER                | Branch          | Worker management, credential oversight          |
| CREDENTIALING_SPECIALIST | Tenant          | Credential verification                          |
| PAYROLL_ADMIN            | Tenant          | Timecard review, pay/bill oversight              |
| CLIENT_ADMIN             | Facility        | Client facility configuration                    |
| HIRING_MANAGER           | Facility        | Shift requests, candidate review                 |
| TIMECARD_APPROVER        | Facility        | Timecard approval                                |
| CLIENT_VIEWER            | Facility        | Read-only client portal access                   |
| WORKER                   | Self            | Self-service (profile, shifts, clock, timecards) |

---

## 5. Permissions

Format: `{resource}:{action}`

### Golden-Path Permissions

| Permission               | Roles That Have It                                                    |
| ------------------------ | --------------------------------------------------------------------- |
| `facilities:create`      | TENANT_ADMIN, PLATFORM_ADMIN                                          |
| `facilities:read`        | SCHEDULER, RECRUITER, CLIENT_ADMIN, HIRING_MANAGER, TIMECARD_APPROVER |
| `facilities:update`      | TENANT_ADMIN, CLIENT_ADMIN                                            |
| `workers:create`         | RECRUITER, TENANT_ADMIN                                               |
| `workers:read`           | SCHEDULER, RECRUITER, CREDENTIALING_SPECIALIST                        |
| `workers:update`         | RECRUITER, WORKER (self only)                                         |
| `credentials:create`     | WORKER (self), RECRUITER, CREDENTIALING_SPECIALIST                    |
| `credentials:verify`     | CREDENTIALING_SPECIALIST                                              |
| `shifts:create`          | SCHEDULER, HIRING_MANAGER                                             |
| `shifts:read`            | SCHEDULER, WORKER, CLIENT_ADMIN, HIRING_MANAGER                       |
| `shifts:publish`         | SCHEDULER                                                             |
| `shifts:cancel`          | SCHEDULER, HIRING_MANAGER                                             |
| `shift-requests:create`  | WORKER                                                                |
| `shift-requests:confirm` | SCHEDULER, HIRING_MANAGER, SYSTEM (policy)                            |
| `shift-requests:reject`  | SCHEDULER, HIRING_MANAGER                                             |
| `clock-events:create`    | WORKER (assigned only)                                                |
| `timecards:read`         | WORKER (own), PAYROLL_ADMIN, TIMECARD_APPROVER                        |
| `timecards:submit`       | WORKER (own), SYSTEM                                                  |
| `timecards:approve`      | TIMECARD_APPROVER, PAYROLL_ADMIN                                      |
| `timecards:reject`       | TIMECARD_APPROVER, PAYROLL_ADMIN                                      |
| `calculations:create`    | PAYROLL_ADMIN, SYSTEM                                                 |
| `calculations:read`      | PAYROLL_ADMIN                                                         |
| `reconciliation:create`  | PLATFORM_ADMIN, TENANT_ADMIN                                          |
| `reconciliation:read`    | PLATFORM_ADMIN, TENANT_ADMIN                                          |

---

## 6. Resource Attributes (ABAC Conditions)

| Attribute                          | Used To Restrict                          |
| ---------------------------------- | ----------------------------------------- |
| `tenant_id`                        | Absolute isolation (always enforced)      |
| `branch_id`                        | Limit scheduler/recruiter to their branch |
| `facility_id`                      | Limit client roles to their facility      |
| `department_id`                    | Limit hiring manager to their department  |
| `worker_id == actor_id`            | Worker can only access own data           |
| `assignment.worker_id == actor_id` | Worker can only clock own assignments     |
| `data_classification`              | Restrict access to RESTRICTED fields      |

---

## 7. Policy Conditions (Examples)

```
# Timecard approval
ALLOW actor TO timecards:approve
  WHERE actor.tenant_id == resource.tenant_id
  AND actor.role IN (TIMECARD_APPROVER, PAYROLL_ADMIN)
  AND actor.facility_ids CONTAINS resource.facility_id
  AND resource.status == 'CLIENT_REVIEW'
  AND actor.id != resource.created_by  # Cannot self-approve corrections

# Worker shift request
ALLOW actor TO shift-requests:create
  WHERE actor.tenant_id == resource.tenant_id
  AND actor.role == WORKER
  AND actor.id == resource.worker_id
  AND resource.shift.status IN (PUBLISHED, PARTIALLY_FILLED)
  AND eligibility(actor, resource.shift) == ELIGIBLE

# Scheduler confirms assignment
ALLOW actor TO shift-requests:confirm
  WHERE actor.tenant_id == resource.tenant_id
  AND actor.role IN (SCHEDULER, HIRING_MANAGER)
  AND (actor.branch_ids CONTAINS resource.shift.branch_id
       OR actor.facility_ids CONTAINS resource.shift.facility_id)
```

---

## 8. Decision Precedence

1. **Explicit DENY always wins** (deny overrides allow).
2. **Tenant mismatch = implicit deny** (before any other evaluation).
3. **Entitlement check** (module enabled for tenant?).
4. **Role-based permission check** (does role grant the permission?).
5. **Attribute-based condition check** (do context attributes satisfy policy?).
6. **If no matching ALLOW rule → implicit deny.**

---

## 9. Break-Glass Administration

| Aspect     | Requirement                                                   |
| ---------- | ------------------------------------------------------------- |
| Activation | Requires documented reason and approval (for RESTRICTED data) |
| Scope      | Specific tenant and time-limited (max 4 hours)                |
| Audit      | Every action logged with elevated-access marker               |
| Monitoring | Alert on any break-glass activation                           |
| Review     | Weekly review of all break-glass usage                        |
| Revocation | Automatic on TTL expiry; manual revocation available          |

---

## 10. Policy Versioning

- Authorization policies are versioned (stored in policy-service or config).
- Every authorization decision records the policy version used.
- Policy changes are audited.
- Rollback of policy version is possible without code deployment.

---

## 11. Authorization Audit Records

Every authorization decision for mutating actions is auditable:

```json
{
  "decision": "ALLOW",
  "actor": { "id": "019...", "type": "user", "roles": ["TIMECARD_APPROVER"] },
  "action": "timecards:approve",
  "resource": { "type": "timecard", "id": "019...", "tenantId": "019..." },
  "policyVersion": "2026-07-16-001",
  "conditions": {
    "tenantMatch": true,
    "roleGrant": true,
    "facilityAccess": true,
    "statusValid": true,
    "selfApprovalCheck": true
  },
  "timestamp": "2026-07-16T14:00:00Z",
  "correlationId": "019..."
}
```
