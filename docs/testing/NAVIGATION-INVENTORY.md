# CareCareer Navigation Inventory

## Platform Admin Console (apps/platform-admin-console)

### Routes

| Route                         | Type          | Auth Required | Persona         | E2E Test | Status |
| ----------------------------- | ------------- | ------------- | --------------- | -------- | ------ |
| `/`                           | Public        | No            | Any             | ✅       | Tested |
| `/tenants`                    | Authenticated | Yes           | Platform Admin  | ✅       | Tested |
| `/tenants/create`             | Authenticated | Yes           | Platform Admin  | ✅       | Tested |
| `/tenants/[id]`               | Authenticated | Yes           | Platform/Tenant | ✅       | Tested |
| `/tenants/[id]/entitlements`  | Authenticated | Yes           | Platform Admin  | ✅       | Tested |
| `/tenants/[id]/organizations` | Authenticated | Yes           | Platform/Tenant | ✅       | Tested |
| `/features`                   | Authenticated | Yes           | Platform Admin  | ✅       | Tested |
| `/audit`                      | Authenticated | Yes           | Platform Admin  | ✅       | Tested |

### Navigation Elements

| Element          | Location | Persona           | E2E Test |
| ---------------- | -------- | ----------------- | -------- |
| Persona selector | Root     | All               | ✅       |
| Dashboard nav    | Sidebar  | All authenticated | ✅       |
| Tenants nav      | Sidebar  | Platform Admin    | ✅       |
| Features nav     | Sidebar  | Platform Admin    | ✅       |
| Audit nav        | Sidebar  | Platform Admin    | ✅       |
| Switch Persona   | Header   | All authenticated | ✅       |

## Identity Service Routes (GP-03.3 — API only, no UI yet)

| Route                           | Type   | Auth | E2E Test |
| ------------------------------- | ------ | ---- | -------- |
| `POST /v1/auth/refresh`         | Public | No   | ❌ (API) |
| `POST /v1/auth/logout`          | Auth   | Yes  | ❌ (API) |
| `POST /v1/auth/logout-all`      | Auth   | Yes  | ❌ (API) |
| `GET /v1/auth/sessions`         | Auth   | Yes  | ❌ (API) |
| `DELETE /v1/auth/sessions/{id}` | Auth   | Yes  | ❌ (API) |
| `GET /v1/auth/me`               | Auth   | Yes  | ❌ (API) |
| `GET /.well-known/jwks.json`    | Public | No   | ❌ (API) |
| `GET /health`                   | Public | No   | ❌ (API) |
| `GET /ready`                    | Public | No   | ❌ (API) |

Note: Identity service has no browser UI in GP-03.3. The identity
administration UI is planned for GP-03.6.

## Gaps

- No cross-browser testing configured (Firefox, WebKit)
- No responsive viewport tests
- No accessibility automated tests
- No visual regression tests
- Identity API routes tested by integration tests, not browser E2E
- No keyboard navigation E2E tests
