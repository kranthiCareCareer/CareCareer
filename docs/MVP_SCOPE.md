# CareCareer MVP Scope

## Objective

Deliver one complete healthcare staffing workflow for three roles (Administrator, Worker, Client) running locally via Docker Compose.

## Included Bounded Contexts

1. **Identity and Authorization** — JWT/JWKS authentication, session management, RBAC
2. **Tenant and Facility Administration** — Multi-tenant provisioning, facilities, departments
3. **Workers** — Worker profiles, lifecycle, self-service
4. **Credentials and Eligibility** — Credential lifecycle, eligibility evaluation
5. **Shifts** — Create, publish, cancel with state machine
6. **Marketplace and Shift Requests** — Worker-facing shift discovery and request
7. **Assignments** — Confirmed worker-shift bindings with lifecycle
8. **Timekeeping and Timecards** — Clock events, timecard submission and approval
9. **Notifications** — Outbox-driven email (MailHog) and in-app notifications
10. **Audit and Operational History** — Append-only audit trail

## Excluded from MVP

- Real OIDC/Auth0 integration (uses demo token adapter)
- AI-powered features (ranking, recommendations, OCR)
- Billing and payroll calculation
- Mobile application
- Real SMS/SES notifications
- AWS deployment (Phase 2)
- Dark mode
- Batch operations
- Real state board API integration

## Demo Accounts

| Persona        | Role           | Tenant               |
| -------------- | -------------- | -------------------- |
| platform-admin | PLATFORM_ADMIN | platform             |
| mas-admin      | TENANT_ADMIN   | mas-medical-staffing |
| worker-sarah   | WORKER         | mas-medical-staffing |
| client-mercy   | CLIENT         | mas-medical-staffing |

## Demo Data

- Mercy General Hospital facility (Atlanta, GA)
- Emergency Department
- Sarah Johnson (RN, active, verified credential)
- 2 published shifts (next 2 days)
