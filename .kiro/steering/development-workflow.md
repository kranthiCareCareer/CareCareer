---
inclusion: always
description: Development cycle, code review checklist, and definition of done
---

# CareCareer Development Workflow

## 1. Before Starting Any Work

1. **Understand the requirement** — Read the ticket/task fully
2. **Check existing patterns** — Does similar code exist? Follow that pattern
3. **Identify the domain** — Which service owns this? Which bounded context?
4. **Ask if unclear** — Ambiguity in requirements = ask before coding

## 2. Development Cycle (Per Feature)

```
1. Create feature branch
   git checkout -b feature/CC-{ticket}-{short-description}

2. Write failing tests FIRST (TDD for domain logic)
   - What should this do?
   - What are the edge cases?
   - What should it NOT do?

3. Implement the code
   - Domain logic first (entities, value objects, rules)
   - Application layer (use case / command handler)
   - Infrastructure (repository, adapters)
   - Interface (controller, DTOs)

4. Verify locally
   pnpm lint                    # Zero warnings
   pnpm format:check            # Prettier conformance
   pnpm type-check              # TypeScript strict
   pnpm test:unit               # All unit tests pass
   pnpm test:integration        # All integration tests pass
   pnpm test:coverage           # Meets thresholds

5. Commit (conventional format)
   git add -p                   # Stage specific changes (not git add .)
   git commit -m "feat(schedule-service): add shift cancellation flow"

6. Push and create PR
   git push -u origin feature/CC-{ticket}-{short-description}
```

## 3. Code Review Checklist (What Reviewers Check)

### Correctness

- [ ] Does it solve the stated problem?
- [ ] Are edge cases handled?
- [ ] Is error handling proper (not swallowed)?
- [ ] Are state transitions valid?

### Security

- [ ] Tenant isolation maintained?
- [ ] Input validated at boundary?
- [ ] No sensitive data in logs?
- [ ] Authorization checked?

### Quality

- [ ] Tests are meaningful (not just coverage-padding)?
- [ ] Code is readable without comments explaining the obvious?
- [ ] No duplication (DRY within reason)?
- [ ] Functions are small and focused?

### Operations

- [ ] Structured logging added for important operations?
- [ ] Errors are observable (logged, can be alerted on)?
- [ ] Database queries are efficient (indexed)?
- [ ] No N+1 query patterns?

## 4. Definition of Done

A feature is DONE when ALL of these are true:

- [ ] Code compiles with zero errors and zero warnings
- [ ] All tests pass (unit + integration + e2e if applicable)
- [ ] Coverage meets thresholds
- [ ] Lint and format pass
- [ ] PR approved by reviewer
- [ ] Documentation updated (API docs, README if needed)
- [ ] Commit messages are meaningful and conventional
- [ ] No TODO without a linked ticket
- [ ] Works in Docker Compose (not just locally without containers)
- [ ] Database migration included (if schema changed)
- [ ] Observability in place (logs, metrics for key operations)

## 5. What Breaks the Build (Immediate Fix Required)

These block ALL other work until resolved:

- Test failure on main branch
- Type error on main branch
- Lint error on main branch
- Docker build failure
- Database migration failure
- Coverage drop below threshold

## 6. Mobile Development Notes (For Future Reference)

Since we'll add React Native (Android + iOS) later:

- Keep business logic in shared packages (not in web-specific code)
- API contracts (Zod schemas) are shared between web and mobile
- Design system components have web AND mobile variants
- Offline-capable patterns established in services from day one
- Time/clock service designed for offline-first from the start
- Push notification infrastructure (notification-service) serves both web and mobile

### Mobile-specific later:

- React Native + Expo (managed workflow)
- Expo Router for navigation
- Light theme as default (matching web)
- Biometric auth for sensitive operations
- Background location for geofence clock validation
- Offline queue with sync-when-connected

## 7. UI/UX Standards

### Theme: LIGHT (clean, professional, healthcare-appropriate)

- White/light gray backgrounds
- High contrast for accessibility (WCAG 2.1 AA minimum)
- Consistent with shadcn/ui defaults (customized to CareCareer brand)
- No dark mode for MVP (add later as user preference)
- Mobile-responsive from day one

### Component Library:

- shadcn/ui as base (light theme default)
- Tailwind CSS for styling
- Shared `packages/ui` consumed by all portals
- Accessible by default (keyboard nav, screen reader, aria labels)

---
