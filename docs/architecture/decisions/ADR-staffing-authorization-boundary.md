# ADR: Staffing Service Authorization Boundary

## Status

Accepted

## Context

The staffing-service manages facilities, departments, credential requirements,
and (future) workers, shifts, and assignments. It needs an authentication and
authorization boundary that:

1. Validates incoming JWT tokens (cryptographic RS256 verification)
2. Extracts the tenant context from the validated principal
3. Enforces permission-based access to endpoints
4. Never derives tenant identity from URL, headers, body, or query parameters

## Decision

### Authentication

The staffing-service uses `StaffingAuthGuard` backed by `LocalJwksTokenValidator`:

1. Extracts Bearer token from Authorization header
2. Decodes protected header → requires RS256 algorithm (rejects HS256, alg=none)
3. Requires kid header claim
4. Resolves public key from JWKS key set
5. Verifies JWT signature + issuer + audience + expiration via jose library
6. Validates required claims (sub, jti, sid, user_authorization_version)
7. Constructs ValidatedTokenContext and attaches to request

Rejection scenarios (all return 401):
- Missing token
- Malformed token
- Unsigned/fabricated signature
- HS256 or other non-RS256 algorithm
- Wrong issuer
- Wrong audience
- Expired token
- Unknown kid
- Token signed with different private key

### Authorization Model (GP-05 Scope)

For GP-05, authorization is **tenant-wide by explicit product decision**:

- Any authenticated user with a valid tenant membership can perform
  facility/department operations within their own tenant
- Cross-tenant access is prevented by RLS (returns 404, not 403)
- Fine-grained facility-level permissions (e.g., "user X can only access
  facility Y within tenant Z") are deferred to GP-10+ when assignment scopes
  are defined

This is a conscious choice, not an oversight:
- Healthcare staffing agencies typically have centralized schedulers who
  manage ALL facilities for their tenant
- Facility-level access restrictions add complexity before the worker/shift
  model exists to define meaningful boundaries
- The authorization decision service (GP-03.4) is available and can be
  integrated when GP-10 defines assignment-based scopes

### Supported Permission Actions (future, not enforced in GP-05)

```
facility.create
facility.read
facility.update
facility.activate
facility.deactivate
department.create
department.read
department.update
department.activate
department.deactivate
credential-requirement.read
credential-requirement.manage
```

These will be enforced via permission guards when the RBAC integration
between staffing-service and identity-service is completed (post-GP-05).

## Alternatives Considered

### A. Live session validation per request

Rejected — adds latency and couples staffing-service to identity-service
availability. The 15-minute access token lifetime provides acceptable
revocation bounds.

### B. Facility-scoped permissions from day one

Deferred — no business model yet defines which users should access which
facilities. Adding it prematurely creates configuration burden without
value until GP-10 (assignments) introduces meaningful scope boundaries.

### C. API gateway handling authentication

Future state — when deployed, gateway validates tokens and forwards the
principal. Services trust the gateway in production (env-gated).

## Consequences

- Staffing-service independently validates tokens (no dependency on identity-service at runtime)
- Revocation bounded by 15-minute token lifetime
- Tenant isolation enforced at both application and database (RLS) layers
- Authorization within a tenant is currently tenant-wide (all-or-nothing)
- Fine-grained permission enforcement will be added when business scopes are defined

## Migration Path

1. GP-05: Tenant-wide access (current)
2. GP-10: Permission guard integration (facility.create, etc.)
3. GP-15: API gateway authentication offload
