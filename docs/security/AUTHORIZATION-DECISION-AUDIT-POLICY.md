# Authorization Decision Audit Policy

## Decision: Denials are persistently audited. Allows are telemetry-only.

## Rationale

Authorization decisions at the identity service may be evaluated at high
frequency (every service-to-service or UI-driven action). Persisting every
allowed decision would create significant storage volume without
proportional security value.

Denials represent security-relevant events (attempted unauthorized access,
stale tokens, suspended accounts). These MUST be persistently audited for
forensic analysis and compliance.

## Category Matrix

| Decision Category                           | Persistent Audit | Structured Telemetry | Failure Behavior |
| ------------------------------------------- | ---------------- | -------------------- | ---------------- |
| Allowed (normal)                            | NO               | YES (metric + log)   | N/A              |
| Default denial (NO_MATCHING_GRANT)          | YES              | YES                  | Remains denied   |
| Explicit denial (EXPLICIT_DENY)             | YES              | YES                  | Remains denied   |
| Inactive user (USER_SUSPENDED/DEACTIVATED)  | YES              | YES                  | Remains denied   |
| Inactive membership (MEMBERSHIP_INVALID)    | YES              | YES                  | Remains denied   |
| Stale authorization version (VERSION_STALE) | YES              | YES                  | Remains denied   |
| Infrastructure failure                      | NOT PERSISTED    | YES (error metric)   | Never allows     |

## Evidence Fields (Persisted for Denials)

Included:

- Decision ID (UUID)
- Tenant ID
- Canonical user ID
- Session ID
- Action
- Resource type
- Resource ID (when safe to record)
- Outcome (DENIED)
- Reason code (stable enum)
- Policy version
- User authorization version
- Membership authorization version
- Correlation ID
- Timestamp

Excluded (NEVER recorded):

- Authorization header
- Access token
- Refresh token
- Token hashes
- Private keys
- Signing secrets
- Database credentials
- Full request context
- SQL errors
- Stack traces

## Outbox Decision

**Authorization decisions do NOT emit domain outbox events.**

Rationale:

- Authorization decisions are not domain state changes
- They are security observations, not business events
- High-volume outbox events would overwhelm downstream consumers
- Security monitoring receives denial signals through structured logging
  and the `authorization_decisions` persistent audit table
- Policy-management changes (adding/revoking denials) ARE domain events
  and would use the outbox when implemented

## Monitoring Path

Security operations receives authorization denial signals through:

1. **Structured JSON log** at `info` level for every denial (immediate)
2. **Persistent audit table** for forensic queries (durable)
3. **Prometheus metric** `authorization_decisions_total{outcome=denied}` (alerting)

## Failure Behavior

- If audit persistence fails during a denial: the result REMAINS denied.
  The operational failure is logged at `error` level for observability.
  No database details are returned to the client.
- If audit persistence fails during an allow: N/A (allows are not persisted).
- Infrastructure failures (state loading, permission loading, denial loading,
  transaction failure) always result in DENIED with a safe reason code.
  No failure path may return `allowed: true`.

## Retention

Authorization decision audit records are retained for 90 days by default.
This aligns with the platform's general audit retention policy. Compliance
requirements may extend retention for specific tenants.

## Correlation

Every decision includes the request's `X-Correlation-Id` (or a generated UUID).
This enables tracing a single user action across authentication, authorization,
and downstream service calls.
