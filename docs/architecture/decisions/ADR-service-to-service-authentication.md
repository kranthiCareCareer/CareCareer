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

### Service Identity via Token Exchange (Current Implementation)

The staffing-service authenticates to the identity-service token endpoint:

```
POST /internal/v1/oauth/token
grant_type=client_credentials
client_id=staffing-service
client_secret=<from-secrets-manager>
scope=identity.state.validate authorization.decide
```

The identity-service validates the registered client and issues a short-lived
service JWT. The staffing-service NEVER holds the identity issuer's signing key.

Service token properties:

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

### ServiceCredentialProvider Abstraction

The credential acquisition is behind an interface:

```typescript
interface ServiceCredentialProvider {
  getCredential(): Promise<ServiceCredential>;
  invalidate(): void;
}
```

Implementations:

- Current: `LocalClientCredentialsProvider` (client secret from env/Secrets Manager)
- Future: `AwsSigV4WorkloadCredentialProvider` (ECS task role, no app credentials)

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

| Endpoint                                       | Auth        | Purpose                |
| ---------------------------------------------- | ----------- | ---------------------- |
| `GET /.well-known/jwks.json`                   | Public      | Key discovery          |
| `POST /internal/v1/identity/state-validations` | Service JWT | Validate session state |
| `POST /internal/v1/authorization/decisions`    | Service JWT | Authorization decision |

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

1. Current: Client-credentials token exchange (identity-service issues tokens)
2. Production: Client secret stored in AWS Secrets Manager with rotation
3. AWS target: ECS task role + SigV4 via VPC Lattice (no application credentials)
4. Identity signing key: KMS-backed asymmetric key (identity-service has kms:Sign)

### Key Security Properties

- The staffing-service NEVER possesses the identity issuer's private key
- A compromised staffing container cannot mint arbitrary service tokens
- The identity-service is the ONLY RS256 token issuer in the platform
- Token exchange credentials (client_secret) are rotatable via Secrets Manager
- SigV4/workload identity eliminates all stored credentials in the final state
