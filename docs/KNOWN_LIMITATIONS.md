# CareCareer Known Limitations

## Authentication

- **Demo token adapter**: Uses a symmetric HMAC demo token for local development. Production requires real OIDC provider (Auth0/Keycloak).
- **No MFA**: Multi-factor authentication deferred to production deployment.
- **No password management**: Identity service does not store passwords (IdP responsibility).
- **Authorization version check**: DemoIdentityStateAdapter validates versions against seeded constants.

## Authorization

- **Permission enforcement active**: Real role-based permission checks in demo mode.
- **No ABAC policy engine**: Attribute-based conditions (facility scope, worker ownership) are enforced by application logic, not a separate policy engine.
- **No break-glass controls**: Emergency elevation not implemented in MVP.

## Eligibility

- **No real primary source verification**: Credentials are manually verified by admin. No state board API integration.
- **No OCR**: Document extraction is manual.
- **No OIG/SAM exclusion check**: Stub only.

## Scheduling

- **No recurring shifts**: Each shift is individually created.
- **No batch operations**: Bulk shift creation not supported.
- **No AI-powered matching**: Workers manually browse and request.

## Timekeeping

- **No real geofencing**: Uses synthetic coordinates for demo. Mobile GPS integration deferred.
- **No overtime calculation**: Hours are raw totals without state-specific OT rules.
- **No break enforcement**: State break requirements not validated.

## Notifications

- **Email via MailHog only**: No real SES/SendGrid. MailHog catches all outbound.
- **No SMS**: Push/SMS deferred to mobile app phase.
- **No real-time WebSocket**: Notifications require page refresh.
- **Delivery triggered via API**: Background worker not yet implemented as auto-polling process.

## User Interface

- **Desktop-first**: Responsive design included but not mobile-optimized.
- **No dark mode**: Light theme only for MVP.
- **Playwright tests not yet implemented**: Browser automation pending.
- **No offline support**: Requires network connectivity.

## Infrastructure

- **Single PostgreSQL instance**: No read replicas or connection pooling beyond pg Pool.
- **No Redis**: Caching and rate limiting deferred.
- **No CDN**: Static assets served directly from nginx.
- **No HTTPS locally**: HTTP only for demo (HTTPS in AWS staging).
- **Image security scanning**: Not yet automated in CI.

## Testing Gaps

- **Integration tests require Docker**: Testcontainers needed for PostgreSQL (not run in this session).
- **No load testing**: Performance benchmarks deferred.
- **Playwright tests**: Not yet implemented.
- **SBOM generation**: Not yet automated.

## Compliance

- **HIPAA-ready architecture**: RLS, audit, no PHI in logs — but formal compliance audit not performed.
- **No BAA**: Business Associate Agreements not in place for demo.
