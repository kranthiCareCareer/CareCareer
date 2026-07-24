# CareCareer MVP Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy (:8080)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ carecareer-  │  │   identity-  │  │    platform-     │  │
│  │     web      │  │   service    │  │    service       │  │
│  │   (:5173)    │  │   (:3100)    │  │    (:3001)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │  staffing-service │  │        notification-worker     │  │
│  │     (:3200)       │  │       (internal process)       │  │
│  └──────────────────┘  └────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │   PostgreSQL 16   │  │          MailHog               │  │
│  │     (:5432)       │  │     (:1025 SMTP / :8025 UI)   │  │
│  └──────────────────┘  └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Service Responsibilities

### identity-service (:3100)
- RS256 JWT token issuance
- Session management with refresh rotation
- User membership and role assignment
- JWKS endpoint for downstream verification
- Demo token endpoint for local development

### platform-service (:3001)
- Tenant provisioning and lifecycle
- Organizations and entitlements
- Feature configuration
- Platform audit trail

### staffing-service (:3200)
- Facilities and departments
- Workers and profiles
- Credentials and eligibility
- Shifts (create, publish, cancel)
- Marketplace (available shifts, requests)
- Assignments (confirm, check-in, complete)
- Timekeeping (clock events, timecards)
- Notifications
- Staffing audit trail

### carecareer-web (:5173)
- React SPA with role-based routing
- Admin, Worker, and Client views
- Demo persona selection

## Database Schema

Single PostgreSQL instance with schema-per-service:
- `identity` — users, sessions, memberships, roles
- `platform` — tenants, organizations, entitlements
- `staffing` — facilities, workers, credentials, shifts, requests, assignments, timecards, notifications, audit

## Security Architecture

- All tables: RLS enabled and forced
- Application roles: never superuser, never BYPASSRLS
- Tenant context: SET LOCAL within transaction (cannot leak)
- JWT: RS256 with key rotation via JWKS
- Cross-tenant access: returns 404 (not 403)
- Audit: append-only, every mutation recorded

## Data Flow (Shift Workflow)

1. Client creates shift (DRAFT) → audit
2. Client publishes shift (PUBLISHED) → audit, marketplace visible
3. Worker requests shift → eligibility check → audit, notification to client
4. Client confirms request → assignment created, fill count incremented → audit, notification to worker
5. Worker clocks in → clock event → assignment CHECKED_IN → audit
6. Worker records break → clock events
7. Worker clocks out → clock event → assignment COMPLETED → audit
8. Worker submits timecard → calculated from events → audit, notification to client
9. Client approves timecard → audit, notification to worker
