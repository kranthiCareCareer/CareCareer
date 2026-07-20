# CareCareer Navigation & Workflow Coverage Matrix

## DEMO-01 Workflows (GP-02 — Complete)

| ID     | Workflow                       | Persona        | Route           | Primary | Alt | Failure | Isolation | Accessibility | Status |
| ------ | ------------------------------ | -------------- | --------------- | ------- | --- | ------- | --------- | ------------- | ------ |
| WF-D01 | Persona selection              | All            | /               | ✅      | ✅  | —       | —         | ❌            | Tested |
| WF-D02 | Dashboard view                 | Platform Admin | /               | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D03 | Tenant list view               | Platform Admin | /tenants        | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D04 | Create tenant                  | Platform Admin | /tenants/create | ✅      | —   | ✅      | —         | ❌            | Tested |
| WF-D05 | Tenant detail                  | Platform Admin | /tenants/[id]   | ✅      | —   | —       | ✅        | ❌            | Tested |
| WF-D06 | Entitlements                   | Platform Admin | /entitlements   | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D07 | Organizations                  | Platform Admin | /organizations  | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D08 | Features configuration         | Platform Admin | /features       | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D09 | Audit timeline                 | Platform Admin | /audit          | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D10 | Tenant isolation               | MAS Admin      | /tenants/[id]   | —       | —   | —       | ✅        | ❌            | Tested |
| WF-D11 | Persona switch                 | All            | /               | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D12 | Validation errors              | Platform Admin | /tenants/create | —       | —   | ✅      | —         | ❌            | Tested |
| WF-D13 | Lifecycle (suspend/reactivate) | Platform Admin | /tenants/[id]   | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D14 | Demo mode display              | All            | /               | ✅      | —   | —       | —         | ❌            | Tested |
| WF-D15 | Executive demo flow            | Platform Admin | Multiple        | ✅      | —   | —       | —         | ❌            | Tested |

## GP-03.3 Authentication Workflows (API — No Browser UI)

| ID     | Workflow                    | Test Type   | Route                      | Status | Notes                       |
| ------ | --------------------------- | ----------- | -------------------------- | ------ | --------------------------- |
| WF-A01 | Session creation            | Integration | POST /v1/auth/dev/session  | ✅     | Testcontainers              |
| WF-A02 | Token refresh (rotation)    | Integration | POST /v1/auth/refresh      | ✅     | Lineage tracked             |
| WF-A03 | Historical replay detection | Integration | POST /v1/auth/refresh      | ✅     | Family compromise           |
| WF-A04 | Concurrent refresh safety   | Integration | POST /v1/auth/refresh      | ✅     | FOR UPDATE lock             |
| WF-A05 | Session revocation          | Integration | POST /v1/auth/logout       | ✅     | Lineage revoked             |
| WF-A06 | Logout all                  | Integration | POST /v1/auth/logout-all   | ✅     | All families revoked        |
| WF-A07 | Session list                | HTTP        | GET /v1/auth/sessions      | ✅     | Contract test               |
| WF-A08 | JWKS retrieval              | HTTP        | GET /.well-known/jwks.json | ✅     | No private fields           |
| WF-A09 | Current identity (/me)      | HTTP        | GET /v1/auth/me            | ✅     | Principal data              |
| WF-A10 | Session state enforcement   | Integration | GET /v1/auth/me            | ✅     | REVOKED/COMPROMISED/EXPIRED |
| WF-A11 | User suspension             | Integration | POST /v1/auth/refresh      | ✅     | AUTH_USER_SUSPENDED         |
| WF-A12 | Membership enforcement      | Integration | POST /v1/auth/refresh      | ✅     | SUSPENDED/DEACTIVATED/STALE |

## GP-03.6 Identity Administration (Planned — No UI Yet)

| ID     | Workflow                | Persona        | Route             | Status  |
| ------ | ----------------------- | -------------- | ----------------- | ------- |
| WF-I01 | User list               | Platform Admin | /users            | Planned |
| WF-I02 | User detail             | Platform Admin | /users/[id]       | Planned |
| WF-I03 | User suspend/reactivate | Platform Admin | /users/[id]       | Planned |
| WF-I04 | External identities     | Platform Admin | /users/[id]       | Planned |
| WF-I05 | Membership management   | Tenant Admin   | /memberships      | Planned |
| WF-I06 | Role assignment         | Tenant Admin   | /memberships/[id] | Planned |
| WF-I07 | Invitation flow         | Tenant Admin   | /invitations      | Planned |
| WF-I08 | Session administration  | Platform Admin | /sessions         | Planned |

## Coverage Summary

| Category         | Total | Tested | Planned | Gap |
| ---------------- | ----- | ------ | ------- | --- |
| DEMO-01 browser  | 15    | 15     | 0       | 0   |
| GP-03.3 auth API | 12    | 12     | 0       | 0   |
| GP-03.6 identity | 8     | 0      | 8       | 0   |
| Accessibility    | 15    | 0      | 15      | 15  |
| Cross-browser    | 15    | 0      | 15      | 15  |
| Responsive       | 15    | 0      | 15      | 15  |
