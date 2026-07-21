# ADR: Staffing Service Authorization Boundary

## Status

Accepted

## Context

The staffing-service manages facilities, departments, credential requirements,
and (future) workers, shifts, and assignments. It needs an authentication and
authorization boundary that:

1. Validates incoming JWT tokens
2. Extracts the tenant context from the validated principal
3. Enforces permission-based access to endpoints
4. Never derives tenant identity from URL, headers, body, or query parameters

The identity-service already owns session validation and token issuance.
The staffing-service must consume tokens but NOT perform session-state validation
(that's identity-service's responsibility for its own endpoints).

## Decision

The staffing-service uses a **lightweight token validation guard** that:

1. Extracts the Bearer token from the Authorization header
2. Verifies the RS256 signature against the JWKS published by identity-service
3. Validates standard claims (iss, aud, exp, iat)
4. Extracts `active_tenant_id` from the validated token payload
5. Attaches the validated principal to the request
6. Does NOT perform live session-state lookups (bounded by 15-minute token TTL)

The `FacilityController` derives `tenantId` exclusively from
`request.principal.selectedTenantId` — which is set only after cryptographic
token validation. This satisfies the "tenant from validated session only" rule.

## Alternatives Considered

### A. Live session validation per request

Rejected — adds latency and couples staffing-service to identity-service
availability. The 15-minute access token lifetime provides acceptable
revocation bounds for staffing operations.

### B. Shared middleware package with session state check

Deferred — can be added later if business rules require immediate revocation
for staffing operations. Current risk is acceptable: a revoked user could
access facilities for up to 15 minutes until token expires.

### C. API gateway handling authentication

Future state — not implemented yet. When deployed, the gateway will validate
tokens and forward the validated principal. Services will trust the gateway
header only when deployed behind the gateway (env-gated).

## Consequences

- Staffing-service is independently deployable (no dependency on identity-service for auth)
- Revocation latency is bounded by access token lifetime (15 minutes max)
- Permission checks happen at the controller level (declarative guards)
- Tenant isolation is enforced at both application and database (RLS) layers
- If identity-service is down, staffing-service continues to serve requests
  using already-issued tokens

## Migration Path

When API gateway is implemented (GP-15):
1. Gateway validates token and sets X-Validated-Principal header
2. Services trust the header when `TRUST_GATEWAY_AUTH=true`
3. Services still validate in non-gateway environments (local dev, tests)
