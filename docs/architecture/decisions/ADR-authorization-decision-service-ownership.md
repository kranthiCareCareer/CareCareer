# ADR: Authorization Decision Service Ownership

## Status: ACCEPTED

## Context

The authorization decision endpoint evaluates whether an authenticated
principal may perform an action on a resource. It requires access to:

- Validated identity principal (from authentication)
- Current session state
- Current user status and authorization version
- Current tenant membership status and authorization version
- Current role assignments
- Current permission grants (resolved from roles)
- Current explicit denials
- Audit/outbox infrastructure

## Decision

The authorization decision endpoint belongs in the **identity-service**.

## Rationale

1. **Owns the authoritative identity state.** The identity-service owns
   users, memberships, roles, permissions, sessions, and authorization
   versions. The decision endpoint requires all of these.

2. **Avoids circular dependencies.** If placed in the platform-service,
   it would need to call back to the identity-service for principal,
   membership, role and permission data — creating a circular dependency.

3. **Single source of truth.** The identity-service already enforces
   session validation, membership state, and authorization versions.
   The decision endpoint is a natural extension of this enforcement.

4. **Guards already available.** The IdentityAuthGuard, SessionStateValidator,
   and PlatformTokenValidator are already in the identity-service.

5. **Future service-to-service use.** Other services (platform, staffing,
   workforce) will call this endpoint to evaluate authorization. This
   creates a clear unidirectional dependency: services → identity.

## Alternatives Considered

- **Dedicated authorization microservice:** Adds operational complexity
  without clear benefit at current scale. Would still need identity-service
  data access.

- **Platform-service:** Would create circular dependency (platform needs
  identity for auth, identity needs platform for... nothing).

- **Shared library:** Cannot enforce server-side state loading. Would
  allow stale JWT-based authorization.

## Consequences

- The identity-service becomes the authoritative authorization authority.
- Other services call `POST /v1/authorization/decisions` for policy queries.
- The identity-service database holds explicit denials and decision audit.
- Future ABAC attributes may require cross-service data, which would be
  resolved through event-sourced projections, not synchronous calls.
