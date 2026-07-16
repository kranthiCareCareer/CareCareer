# CareCareer — Technology Stack & Local-First Strategy

## Philosophy: Local First, Cloud Later

Build everything locally with Docker Compose. Get it solid, tested, and proven.
Then migrate to AWS when ready for production. No premature cloud complexity.

---

## The Stack

### Backend

| Layer            | Technology                         | Why                                                                                       |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| **Language**     | TypeScript (Node.js 20+)           | Single language front-to-back, strong typing, huge ecosystem                              |
| **Framework**    | NestJS                             | Enterprise-grade, modular, built-in DI, OpenAPI generation, guards/interceptors for auth  |
| **API Style**    | REST (OpenAPI 3.1)                 | External/portal APIs. gRPC later for internal service-to-service if needed                |
| **Validation**   | Zod + class-validator              | Runtime type safety at boundaries                                                         |
| **ORM**          | Prisma                             | Type-safe queries, migrations, great DX. Supports Postgres natively                       |
| **Event Bus**    | BullMQ (Redis-backed)              | Job queues, event processing, retries, DLQ — locally. Replace with SQS/EventBridge in AWS |
| **Auth**         | Custom JWT + Passport.js           | Locally. Swap to Cognito in AWS. RBAC+ABAC middleware from day one                        |
| **File Storage** | MinIO (S3-compatible)              | Runs locally, identical API to S3. Zero code changes when migrating                       |
| **Search**       | Meilisearch or OpenSearch (Docker) | Full-text + faceting locally. Swap to OpenSearch Serverless in AWS                        |

### Frontend

| Layer                | Technology                   | Why                                                        |
| -------------------- | ---------------------------- | ---------------------------------------------------------- |
| **Web Framework**    | Next.js 14 (App Router)      | SSR, RSC, API routes, great DX                             |
| **UI Library**       | React 18 + TypeScript        | Industry standard                                          |
| **Component System** | shadcn/ui + Tailwind CSS     | Beautiful, accessible, customizable. No vendor lock-in     |
| **State**            | TanStack Query (React Query) | Server state management, caching, optimistic updates       |
| **Forms**            | React Hook Form + Zod        | Performant forms with schema validation                    |
| **Tables/Data**      | TanStack Table               | Complex data grids (timecards, schedules, candidate lists) |

### Mobile

| Layer          | Technology           | Why                                            |
| -------------- | -------------------- | ---------------------------------------------- |
| **Framework**  | React Native + Expo  | Cross-platform, shared TypeScript, OTA updates |
| **Navigation** | Expo Router          | File-based routing like Next.js                |
| **Offline**    | WatermelonDB or MMKV | Offline clock events, sync when connected      |
| **Location**   | expo-location        | Geofence for clock-in validation               |

### Databases (All in Docker locally)

| Database          | Use Case                                                       | Local  | AWS Later             |
| ----------------- | -------------------------------------------------------------- | ------ | --------------------- |
| **PostgreSQL 16** | Core business data (workers, jobs, shifts, timecards, billing) | Docker | Aurora PostgreSQL     |
| **Redis 7**       | Cache, sessions, job queues (BullMQ), rate limiting            | Docker | ElastiCache           |
| **MinIO**         | Document storage (resumes, credentials, contracts)             | Docker | S3                    |
| **Meilisearch**   | Candidate search, job search, matching                         | Docker | OpenSearch Serverless |

### AI Layer

| Layer                  | Technology                    | Why                                                             |
| ---------------------- | ----------------------------- | --------------------------------------------------------------- |
| **SDK**                | Vercel AI SDK or LangChain.js | TypeScript-native, streaming, tool-calling                      |
| **Models (local dev)** | OpenAI API or Anthropic API   | Use API keys for dev. Swap to Bedrock in production             |
| **Model Router**       | Custom service                | Abstracts provider — swap OpenAI → Bedrock without code changes |
| **OCR**                | Tesseract.js (local)          | Document extraction. Swap to AWS Textract in production         |

### DevOps & Tooling

| Tool                  | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| **Docker Compose**    | Run all services + databases locally with one command  |
| **Turborepo**         | Monorepo management, shared packages, selective builds |
| **pnpm**              | Fast, disk-efficient package manager                   |
| **Prisma Migrate**    | Database schema migrations                             |
| **Vitest**            | Unit + integration testing                             |
| **Playwright**        | E2E testing                                            |
| **ESLint + Prettier** | Code quality                                           |
| **GitHub Actions**    | CI (lint, test, build) — runs locally too via act      |

---

## ECS vs EKS — The Decision

**Short answer: ECS (Fargate) for production. Not EKS.**

Here's why:

| Factor                 | ECS Fargate                       | EKS                                           |
| ---------------------- | --------------------------------- | --------------------------------------------- |
| **Complexity**         | Low — AWS manages everything      | High — you manage cluster, nodes, upgrades    |
| **Team size needed**   | 1-2 DevOps people                 | 2-3 dedicated Kubernetes engineers            |
| **Cost (small scale)** | Lower — pay per task              | Higher — control plane + nodes always running |
| **Learning curve**     | Small — just task definitions     | Massive — Helm, kubectl, networking, RBAC     |
| **Scaling**            | Auto — Fargate scales per task    | Manual node scaling + HPA                     |
| **When to use**        | Teams <30 engineers, <50 services | Teams 50+, 100+ services, multi-cloud needed  |
| **Docker Compose → ?** | Direct mapping (service = task)   | Need Helm charts, manifests, operators        |

**Recommendation:** Start local with Docker Compose. Deploy to ECS Fargate when ready.
Each Docker container becomes an ECS Task Definition. The mapping is 1:1.

If you grow to 50+ engineers and need Kubernetes features (custom operators, service mesh, etc.), migrate to EKS then. Most successful startups never need EKS.

---

## Local Architecture (Docker Compose)

```
docker-compose.yml runs:

┌─────────────────────────────────────────────────────────┐
│                   DOCKER COMPOSE                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  SERVICES:                     INFRASTRUCTURE:           │
│  ──────────                    ───────────────           │
│  ┌──────────────┐             ┌──────────────┐          │
│  │ api-gateway  │ :3000       │  postgres    │ :5432    │
│  │ (Next.js BFF)│             │  (v16)       │          │
│  └──────────────┘             └──────────────┘          │
│  ┌──────────────┐             ┌──────────────┐          │
│  │ tenant-svc   │ :3001       │  redis       │ :6379    │
│  │ (NestJS)     │             │  (v7)        │          │
│  └──────────────┘             └──────────────┘          │
│  ┌──────────────┐             ┌──────────────┐          │
│  │ worker-svc   │ :3002       │  minio       │ :9000    │
│  │ (NestJS)     │             │  (S3-compat) │          │
│  └──────────────┘             └──────────────┘          │
│  ┌──────────────┐             ┌──────────────┐          │
│  │credential-svc│ :3003       │  meilisearch │ :7700    │
│  │ (NestJS)     │             │  (search)    │          │
│  └──────────────┘             └──────────────┘          │
│  ┌──────────────┐             ┌──────────────┐          │
│  │ schedule-svc │ :3004       │  mailpit     │ :8025    │
│  │ (NestJS)     │             │  (email dev) │          │
│  └──────────────┘             └──────────────┘          │
│  ┌──────────────┐                                       │
│  │ time-svc     │ :3005                                 │
│  │ (NestJS)     │                                       │
│  └──────────────┘                                       │
│  ┌──────────────┐                                       │
│  │ payroll-svc  │ :3006                                 │
│  │ (NestJS)     │                                       │
│  └──────────────┘                                       │
│  ┌──────────────┐                                       │
│  │ notification │ :3007                                 │
│  │ (NestJS)     │                                       │
│  └──────────────┘                                       │
│  ┌──────────────┐                                       │
│  │ admin-portal │ :4000                                 │
│  │ (Next.js)    │                                       │
│  └──────────────┘                                       │
│  ┌──────────────┐                                       │
│  │client-portal │ :4001                                 │
│  │ (Next.js)    │                                       │
│  └──────────────┘                                       │
│  ┌──────────────┐                                       │
│  │worker-portal │ :4002                                 │
│  │ (Next.js)    │                                       │
│  └──────────────┘                                       │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
carecareer/
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
├── turbo.json                # Turborepo pipeline config
├── docker-compose.yml        # Run everything locally
├── .env.example              # Environment variables template
│
├── apps/
│   ├── admin-portal/         # Next.js — recruiter/admin workspace
│   ├── client-portal/        # Next.js — facility/client view
│   ├── worker-portal/        # Next.js — candidate/worker view
│   └── mobile/               # React Native + Expo
│
├── services/
│   ├── api-gateway/          # NestJS — BFF, routing, auth check
│   ├── tenant-service/       # NestJS — multi-tenancy, config
│   ├── identity-service/     # NestJS — auth, users, roles, permissions
│   ├── worker-service/       # NestJS — profiles, availability
│   ├── credential-service/   # NestJS — credentials, verification
│   ├── recruit-service/      # NestJS — jobs, applications, pipeline
│   ├── schedule-service/     # NestJS — shifts, assignments
│   ├── time-service/         # NestJS — clock, timecards
│   ├── payroll-service/      # NestJS — pay calc, billing, export
│   ├── notification-service/ # NestJS — email, SMS, push
│   └── ai-service/           # NestJS — model router, agent orchestration
│
├── packages/
│   ├── shared-types/         # Shared TypeScript types & interfaces
│   ├── domain-kernel/        # Base entity, state machine, value objects
│   ├── auth/                 # JWT, RBAC, ABAC utilities
│   ├── tenant-context/       # Tenant ID propagation middleware
│   ├── database/             # Prisma client, RLS helpers, migrations
│   ├── events/               # Event schemas, publisher, consumer
│   ├── ui/                   # Shared React component library (design system)
│   ├── validation/           # Shared Zod schemas
│   └── testing/              # Test utilities, factories, fixtures
│
├── infrastructure/
│   ├── docker/               # Dockerfiles per service
│   ├── terraform/            # AWS infra (for later)
│   └── scripts/              # Dev scripts (seed, migrate, etc.)
│
└── docs/
    ├── adr/                  # Architecture Decision Records
    ├── api/                  # OpenAPI specs
    └── flows/                # Business flow documentation
```

---

## Local → AWS Migration Path

The whole point is: **zero architecture changes when moving to cloud.**

| Local (Docker Compose)  | AWS Production             | Code Changes Needed                        |
| ----------------------- | -------------------------- | ------------------------------------------ |
| PostgreSQL container    | Aurora PostgreSQL          | Change connection string only              |
| Redis container         | ElastiCache Redis          | Change connection string only              |
| MinIO container         | S3                         | Zero — same SDK, same API                  |
| Meilisearch container   | OpenSearch Serverless      | Swap search client adapter                 |
| BullMQ (Redis queues)   | SQS + EventBridge          | Swap queue adapter (interface stays same)  |
| Docker Compose services | ECS Fargate tasks          | Dockerfile stays same, add task definition |
| Local JWT auth          | Cognito + JWT              | Swap token issuer, keep RBAC/ABAC logic    |
| Tesseract.js (OCR)      | AWS Textract               | Swap OCR adapter                           |
| OpenAI API              | Amazon Bedrock             | Swap model router provider                 |
| Mailpit (dev email)     | SES or SendGrid            | Swap email adapter                         |
| GitHub Actions          | GitHub Actions → ECR → ECS | Add deploy step                            |

**Pattern: Every external dependency is behind an interface (adapter pattern).**
Swap the adapter, keep the business logic unchanged.

```typescript
// Example: Storage adapter
interface StoragePort {
  upload(key: string, file: Buffer, metadata: FileMetadata): Promise<string>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// Local: MinIO implementation
class MinioStorageAdapter implements StoragePort { ... }

// Production: S3 implementation (identical SDK!)
class S3StorageAdapter implements StoragePort { ... }
```

---

## What You Need Installed (Dev Machine)

```bash
# Required
- Node.js 20+ (via nvm)
- pnpm 9+
- Docker Desktop (for Docker Compose)
- Git

# Recommended
- VS Code / Cursor / Kiro
- Postman or Bruno (API testing)
- TablePlus or pgAdmin (database GUI)
- Redis Insight (Redis GUI)
```

---

## One Command to Start

Once scaffolded, the entire platform runs with:

```bash
# Start all infrastructure (Postgres, Redis, MinIO, Meilisearch)
docker compose up -d

# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Start all services in dev mode
pnpm dev
```

---

## Key Architecture Decisions

### 1. Shared Database vs Database-per-Service

**Decision: Shared PostgreSQL, schema-per-service.**

Why: For a team of 5-15 engineers, database-per-service is operational overhead
with no benefit. Use one Postgres instance with separate schemas:

```
postgres/
├── tenant_schema    (tenants, config, entitlements)
├── identity_schema  (users, roles, permissions, sessions)
├── worker_schema    (workers, profiles, availability, documents)
├── credential_schema (credentials, requirements, verifications)
├── recruit_schema   (jobs, applications, submissions, pipeline)
├── schedule_schema  (shifts, assignments, offers)
├── time_schema      (clock_events, timecards, approvals)
├── payroll_schema   (pay_rules, earnings, batches, invoices)
└── shared_schema    (audit_log, notifications, events_outbox)
```

Each service only has access to its own schema. Cross-service = API calls only.
Enforced by database roles (each service connects with its own user).

### 2. Synchronous vs Async Communication

**Decision: Sync (REST) for commands, Async (BullMQ events) for propagation.**

- "Create a shift" → Sync REST call to schedule-service (need immediate response)
- "Shift was confirmed" → Async event (notification-service, time-service react)

### 3. Auth Strategy (Local)

**Decision: Custom JWT with RBAC+ABAC, designed to swap to Cognito later.**

```
Login → identity-service issues JWT
JWT contains: { userId, tenantId, roles[], permissions[] }
Every service validates JWT and enforces tenant scope

Middleware chain:
  Request → Extract JWT → Validate → Set tenant context → Check permission → Handler
```

### 4. Multi-tenancy (Enforced Locally Same as Production)

**Decision: RLS from day one, even locally.**

```sql
-- Every table has tenant_id
-- Every query is automatically scoped
-- Even in local dev, you CANNOT see another tenant's data
-- This prevents bugs that only appear in production
```

---

## Summary

| Question            | Answer                                           |
| ------------------- | ------------------------------------------------ |
| Language?           | TypeScript everywhere                            |
| Backend?            | NestJS (modular, enterprise-grade)               |
| Frontend?           | Next.js + shadcn/ui + Tailwind                   |
| Mobile?             | React Native + Expo                              |
| Database?           | PostgreSQL (shared instance, schema-per-service) |
| Cache?              | Redis (sessions, queues, cache)                  |
| Search?             | Meilisearch (local) → OpenSearch (AWS)           |
| Files?              | MinIO (local) → S3 (AWS)                         |
| AI?                 | OpenAI/Anthropic API → Bedrock (AWS)             |
| Queue?              | BullMQ/Redis → SQS/EventBridge (AWS)             |
| Deployment (local)? | Docker Compose                                   |
| Deployment (prod)?  | ECS Fargate (NOT EKS)                            |
| Monorepo?           | Turborepo + pnpm                                 |
| Testing?            | Vitest + Playwright                              |

**Next step: Scaffold the monorepo and get `docker compose up` running.**
