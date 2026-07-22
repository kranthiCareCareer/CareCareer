---
inclusion: always
description: Code commenting, API docs, README, and ADR standards
---

# CareCareer Documentation & Commenting Standards

## 1. Code Comments — When and How

### WHEN to comment:

- **WHY** something is done a non-obvious way (business rule, workaround, constraint)
- **WHAT** a complex algorithm or formula does (pay calculations, matching scores)
- **WARNING** about gotchas, side effects, or sequencing requirements
- **TODO** with a linked ticket: `// TODO(CC-123): replace with state board API when available`
- **REGULATORY** context: `// HIPAA: PHI must not be logged`

### WHEN NOT to comment:

- What the code obviously does (self-documenting code > comments)
- Commented-out code (delete it, git has history)
- Author/date stamps (git blame exists)

### Format:

```typescript
/**
 * Calculates overtime earnings for a worker's timecard.
 *
 * Rules:
 * - California: daily OT after 8h, double-time after 12h
 * - Federal default: weekly OT after 40h
 * - State-specific rules override federal
 *
 * @param timecard - Approved timecard with validated hours
 * @param payRules - Applicable pay rules for this worker/client/state
 * @returns Earnings breakdown with base, OT, and double-time components
 *
 * @see https://www.dol.gov/agencies/whd/overtime
 */
function calculateOvertimeEarnings(
  timecard: ApprovedTimecard,
  payRules: PayRuleSet,
): EarningsBreakdown { ... }
```

## 2. API Documentation (OpenAPI)

Every HTTP endpoint MUST have:

- Summary (one line)
- Description (what it does, who can call it)
- Request body schema with examples
- Response schemas (success + all error codes)
- Required permissions listed
- Rate limiting info

Generated from code decorators (NestJS Swagger module). Never hand-written separately.

## 3. Service README

Every service has a README.md with:

````markdown
# {Service Name}

## Purpose

One paragraph: what this service owns and is responsible for.

## Domain Entities

- Entity A (lifecycle: states)
- Entity B (lifecycle: states)

## API Endpoints

Link to generated OpenAPI docs.

## Events Published

- `domain.entity.verb.v1` — when X happens

## Events Consumed

- `other-domain.entity.verb.v1` — triggers Y

## Dependencies

- PostgreSQL (schema: {schema_name})
- Redis (for: caching/queues)
- Other services called: [list]

## Local Development

\```bash
pnpm --filter {service-name} dev
\```

## Environment Variables

| Variable     | Required | Description           |
| ------------ | -------- | --------------------- |
| DATABASE_URL | Yes      | PostgreSQL connection |
| REDIS_URL    | Yes      | Redis connection      |
````

## 4. Architecture Decision Records (ADRs)

For any significant decision, write an ADR in `docs/adr/`:

```markdown
# ADR-{number}: {Title}

## Status

Accepted | Proposed | Superseded by ADR-X

## Context

What is the problem? Why does this decision need to be made?

## Decision

What did we decide?

## Alternatives Considered

What else did we evaluate? Why was it rejected?

## Consequences

What are the tradeoffs? What becomes harder?

## Migration Path

How do we get from current state to this decision?
```

## 5. Inline Type Documentation

All shared types and interfaces MUST have JSDoc:

```typescript
/** A healthcare worker registered on the platform */
interface Worker {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Owning tenant — used for RLS enforcement */
  tenantId: string;
  /** Worker lifecycle status */
  status: WorkerStatus;
  /** All active credentials for this worker */
  credentials: Credential[];
}
```

## 6. When In Doubt — Ask

If requirements are ambiguous, DO NOT guess. Ask before implementing:

- "Should this block the workflow or just warn?"
- "Is this per-tenant configurable or platform-wide?"
- "What happens if both conditions are true simultaneously?"
- "Is there a regulatory requirement driving this?"
- "What's the expected volume/frequency?"

A wrong assumption caught after deployment costs 10x more than a question asked during development.

---
