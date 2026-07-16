# ADR-002: Identity Provider

- Status: **Deferred**
- Date: 2026-07-16
- Owners: CTO, Security Lead
- Decision deadline: Before identity-service reaches staging deployment
- Review trigger: First external user needs to authenticate against CareCareer

## Context

The existing Maestra platform uses Auth0 for external candidate and caregiver
authentication. Internal services validate JWTs using JWKS endpoints. CareCareer
needs authentication for workers, clients, admins, and suppliers.

CareCareer MUST own authorization (RBAC+ABAC, tenant membership, permissions).
CareCareer MUST NOT own authentication protocols (passwords, MFA, account recovery).

## Decision

**Deferred.** The following interface is locked now:

1. Identity provider MUST support OIDC and OAuth 2.0.
2. Token signing MUST use RS256 or stronger asymmetric algorithm.
3. Token validation MUST use JWKS endpoint discovery.
4. Provider MUST support MFA (required for admin/recruiter roles).
5. Provider MUST support invitation and account-recovery flows.
6. CareCareer MUST NOT store passwords.
7. External OIDC subject (`sub` claim) is mapped to an internal canonical user ID.
8. Provider-specific claims are translated at the platform boundary (identity-service).
9. No provider-specific types leak into domain services.

**Default if no contrary evidence:** Retain Auth0 for external users.

Auth0 is the realistic default because:

- Already serving external authentication in Maestra
- User accounts already exist (no migration needed for existing users)
- Proven MFA, SSO, and federation support
- OIDC/JWKS patterns already implemented

Cognito would be chosen only if:

- Auth0 license cost becomes prohibitive at scale
- AWS-native integration provides meaningful operational benefit
- Migration path for existing Auth0 users is proven safe

**Local development:** Keycloak Docker container for isolated OIDC testing
without Auth0 dependency.

## Alternatives considered

| Option                 | Pros                                            | Cons                                                       |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Auth0 (retain)         | Zero user migration; proven; existing knowledge | Vendor cost at scale; external dependency                  |
| Amazon Cognito         | AWS-native; potentially lower cost              | User migration required; different feature set             |
| Keycloak (self-hosted) | Full control; open source                       | Operational burden; no managed service                     |
| Custom JWT issuer      | Full control                                    | Security liability; maintenance burden; violates principle |

## Consequences

- CareCareer identity-service is an authorization and mapping layer, not an IdP.
- Provider swap is possible without application code changes.
- Local development uses Keycloak; no Auth0 dependency for dev.

## Security implications

- Token validation at every service boundary (JWKS-based).
- Short-lived access tokens (15 min); refresh token rotation.
- MFA mandatory for privileged roles.
- Token revocation via short TTL + deny list for critical scenarios.
- No JWT contents trusted without signature verification.

## Operational implications

- Auth0 management API access required for user provisioning.
- Monitoring of Auth0 availability and rate limits.
- Fallback behavior defined for IdP outage (cached JWKS; degrade gracefully).

## Migration implications

- Existing Auth0 users do NOT need to re-register.
- CareCareer maps Auth0 `sub` to canonical user ID via `external_references`.
- New invitation flow uses CareCareer identity-service → Auth0 user creation.

## Validation criteria

- [ ] identity-service validates tokens without provider-specific SDK
- [ ] JWKS rotation handled automatically
- [ ] Local dev works with Keycloak (no Auth0 required)
- [ ] Provider-specific claims do not appear in domain service code
- [ ] MFA enforceable per role
- [ ] User can authenticate after provider swap (interface test)

## References

- Auth0 OIDC documentation
- Existing Maestra JWT validation middleware
- CARECAREER_MASTER_PACKAGE.md Section 9 (Identity, Authorization, Entitlements)
