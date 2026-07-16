---
inclusion: always
---

# CareCareer Coding Standards

## 1. Code Quality Rules

### TypeScript Strictness
- `strict: true` in all tsconfig.json — no exceptions
- No `any` types. Use `unknown` + type guards if type is truly unknown
- No `@ts-ignore` or `@ts-expect-error` without a linked issue explaining why
- All functions must have explicit return types (no inference for public APIs)
- All parameters must be typed — no implicit `any`

### Naming Conventions
- **Files:** kebab-case (`worker-service.ts`, `create-shift.handler.ts`)
- **Classes:** PascalCase (`WorkerService`, `ShiftCreatedEvent`)
- **Interfaces:** PascalCase, no `I` prefix (`WorkerRepository` not `IWorkerRepository`)
- **Functions/methods:** camelCase (`createShift`, `validateCredential`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`, `DEFAULT_PAGE_SIZE`)
- **Database columns:** snake_case (`tenant_id`, `created_at`, `shift_status`)
- **Environment variables:** UPPER_SNAKE_CASE (`DATABASE_URL`, `REDIS_HOST`)
- **Event types:** dot-separated past tense (`schedule.shift.confirmed.v1`)

### Code Structure per Service
```
services/{service-name}/
├── src/
│   ├── domain/           # Business logic, entities, value objects, state machines
│   │   ├── entities/
│   │   ├── events/
│   │   ├── errors/
│   │   └── value-objects/
│   ├── application/      # Use cases, commands, queries, DTOs
│   │   ├── commands/
│   │   ├── queries/
│   │   └── dto/
│   ├── infrastructure/   # Database, external APIs, adapters
│   │   ├── database/
│   │   ├── adapters/
│   │   └── messaging/
│   ├── interface/        # Controllers, guards, interceptors
│   │   ├── http/
│   │   └── grpc/
│   └── config/           # Module registration, env validation
├── test/
│   ├── unit/             # Pure logic tests (no I/O)
│   ├── integration/      # Database + service tests
│   └── e2e/              # Full HTTP endpoint tests
├── prisma/
│   └── schema.prisma
└── Dockerfile
```

### Function/Method Rules
- Max function length: 30 lines (extract helpers if longer)
- Max file length: 300 lines (split into modules if longer)
- Max parameters: 3 (use an options object if more)
- Single responsibility: one function does one thing
- Pure functions preferred: same input = same output, no side effects
- Guard clauses first: validate and return early, then happy path

---
