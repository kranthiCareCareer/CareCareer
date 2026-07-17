# DEMO-01 Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Chromium / any modern browser)                 │
│  React + TypeScript + Vite                              │
│  http://localhost:4000                                   │
└────────────────────┬────────────────────────────────────┘
                     │ /api/* proxy
                     ▼
┌─────────────────────────────────────────────────────────┐
│  platform-service (NestJS)                              │
│  http://localhost:3001                                   │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐│
│  │ Auth     │ │ Tenant   │ │ Entitle  │ │ Lifecycle  ││
│  │ Guard    │ │ CRUD     │ │ ment     │ │ State      ││
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐│
│  │ Idempot  │ │ Audit    │ │ Outbox   │ │ Feature    ││
│  │ ency     │ │ Writer   │ │ Writer   │ │ Config     ││
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘│
└────────────────────┬────────────────────────────────────┘
                     │ PostgreSQL wire protocol
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL 16                                          │
│  localhost:5432 / carecareer_demo                        │
│                                                         │
│  Tables: tenants, organizations, branches,              │
│          entitlements, features, audit_records,          │
│          outbox_events, idempotency_records             │
│                                                         │
│  RLS: tenant_id = current_setting('app.tenant_id')     │
│  Roles: carecareer_admin (owner), app_service (runtime)│
└─────────────────────────────────────────────────────────┘
```

## Authentication Flow (Demo Mode)

```
1. User clicks persona button
2. Frontend POSTs to /api/demo/token
3. Backend (DemoAuthController) verifies:
   - DEMO_MODE=true
   - NODE_ENV ≠ production
   - DEMO_AUTH_SECRET is set
4. Backend signs JWT (HS256) with 15-min expiry
5. Frontend stores token in memory (not localStorage)
6. All API calls include Authorization: Bearer <token>
7. Auth guard verifies signature + expiry
8. Claims mapped to request context (tenantId, role, permissions)
```

## Transaction Flow (Mutations)

```
1. HTTP request arrives
2. Auth guard validates JWT
3. Permission guard checks required permission
4. Validation pipe checks Zod schema
5. Idempotency check (SELECT FOR UPDATE on idempotency_records)
6. Tenant status guard (ACTIVE required for mutations)
7. Command handler executes domain logic
8. Within single PostgreSQL transaction:
   a. Domain entity mutation
   b. Audit record INSERT
   c. Outbox event INSERT
   d. Idempotency record UPDATE (COMPLETED)
9. Transaction commits
10. HTTP response with correlation ID
```

## Security Layers

| Layer | Mechanism | What It Prevents |
|-------|-----------|-----------------|
| Authentication | JWT verification | Unauthenticated access |
| Authorization | Permission guard | Unauthorized operations |
| Tenant isolation | RLS + app context | Cross-tenant data leaks |
| Input validation | Zod schemas | Injection, malformed data |
| Idempotency | DB constraint + hash | Duplicate mutations |
| Concurrency | Optimistic locking | Lost updates |
| Lifecycle | Status guard | Operations on frozen tenants |
| Audit | Append-only + restricted grants | Tampering with history |

## Package Architecture

```
packages/
├── config          — Environment validation (Zod)
├── auth            — Provider-neutral JWT, permissions
├── database        — Connection, tenant context, transactions
├── request-context — AsyncLocalStorage for correlation/tenant
├── events          — Domain event types, outbox interface
├── idempotency     — Idempotency key management
├── observability   — Structured logging
├── service-core    — NestJS module composition
├── testing         — Test helpers, factories, Testcontainers
└── shared-types    — Cross-package TypeScript types

services/
└── platform-service — Tenant management service

apps/
└── platform-admin-console — React admin UI
```
