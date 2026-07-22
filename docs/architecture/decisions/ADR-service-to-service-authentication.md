# ADR: Service-to-Service Authentication

## Status

Accepted (2026-07-22)

## Context

The staffing-service needs to call identity-service internal endpoints for:
1. Session/user/membership state validation
2. Authorization decisions

These are privileged internal endpoints that must verify the calling workload,
not just forward a user token.

## Decision

### Service Identity JWT (Option A)

The staffing-service authenticates to internal endpoints using a short-lived
service JWT with these properties:

```json
{
  "iss": "carecareer-identity",
  "sub": "service:staffing-service",
  "aud": "carecareer-internal",
  "client_id": "staffing-service",
  "token_type": "service",
  "scopes": ["identity.state.validate", "authorization.decide"],
  "iat": 1784736000,
  "exp": 1784736300,
  "jti": "unique-id"
}
```

- Lifetime: 5 minutes maximum
- Cached until shortly before expiry, then renewed
- Credentials for token acquisition stored in AWS Secrets Manager
- Client-credentials-style flow for token issuance

### User Context Propagation

After the staffing-service validates the user's access token locally (RS256),
it sends only the validated principal fields to internal endpoints:

```typescript
interface ServiceCallPrincipal {
  subject: string;
  sessionId: string;
  selectedTenantId: string;
  membershipId: string;
  userAuthorizationVersion: number;
  membershipAuthorizationVersion: number;
}
```

The raw user bearer token is NOT forwarded as the primary credential.

### Endpoint Structure

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /.well-known/jwks.json` | Public | Key discovery |
| `POST /internal/v1/identity/state-validations` | Service JWT | Validate session state |
| `POST /internal/v1/authorization/decisions` | Service JWT | Authorization decision |

### Fail-Closed Rules

The staffing-service MUST deny access when:
- Missing service token configuration → refuse to start
- Invalid/expired service token → deny request
- Identity service unavailable → deny request
- Timeout (3s) → deny request
- Malformed response → deny request
- Unknown decision value → deny request
- Missing policy version → deny request
- HTTP 4xx/5xx → deny request

### Security Requirements for Internal Endpoints

The identity/authorization services MUST validate:
- Caller service identity (from service JWT sub/client_id)
- Service token audience (carecareer-internal)
- Service token expiry
- Required service scope
- Strict request schema
- Current user/session/membership state (from server-side DB, not request)

## Alternatives Rejected

### B — Raw pass-through user token

Rejected because:
- Audience mismatch (user tokens target carecareer-api, not internal)
- Confused-deputy risk (can't distinguish user calling vs service calling)
- Excessive token propagation across service boundaries
- No service authorization (can't restrict which services call which endpoints)
- Harder migration to workload identity (ECS task roles, SPIFFE)

### C — Shared API key

Rejected because:
- No rotation story
- No per-service authorization
- No audit trail of which service made which call
- No standards-based identity

## Consequences

- Each service needs credentials for service token acquisition
- Identity-service needs internal endpoints (not yet implemented)
- Service-to-service calls add ~5ms latency for token validation
- Clear separation between user-facing and internal APIs
- Future migration to AWS workload identity or mTLS is straightforward

## Migration Path

1. Current: Client-credentials JWT via Secrets Manager
2. Future: ECS task role / EKS workload identity (no application credentials)
3. Long-term: mTLS or SPIFFE/SPIRE for zero-trust service mesh
