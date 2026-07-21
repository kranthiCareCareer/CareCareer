---
inclusion: auto
---

# Autonomous Execution Rules

## Resumption Protocol

When starting a new session:

1. Read `docs/execution/AUTONOMOUS-EXECUTION-STATE.md` first
2. Verify its recorded HEAD matches `git rev-parse HEAD`
3. Verify working tree is clean
4. Execute the recorded "Next Command"
5. Continue without asking the user to restate context

## Stopping Rules

Do NOT stop after:
- A commit
- A passing test
- A progress checkpoint
- Completing one file or function
- Writing documentation

Stop ONLY when:
- The current milestone's full acceptance gate passes
- A genuine external blocker prevents all work
- The execution environment forces termination

## Checkpoint Behavior

After every bounded commit:
1. Update `docs/execution/AUTONOMOUS-EXECUTION-STATE.md`
2. Record the exact next file, command, and expected commit
3. Continue immediately to that next task

A checkpoint is NOT a stopping point. It is a save point for crash recovery.

## Commit Policy

- Small, forward-only, conventional commits
- Never rewrite history
- Never force push
- Every commit must compile and pass its focused tests
- Update the execution state after meaningful progress

## Golden Path Execution Order

Read `docs/decisions/golden-path-backlog.md` for the authoritative sequence.
Dependencies determine order. When multiple milestones are dependency-safe,
prioritize workforce-product value over control-plane polishing.

## What "Complete" Means

A milestone closes ONLY when:
- All acceptance criteria pass
- Real PostgreSQL integration tests prove RLS and isolation
- Security coverage thresholds pass
- OpenAPI validates
- Build passes
- Demo works
- Browser tests pass (Chromium at minimum)
- Closure document exists
- Working tree is clean

## Browser Testing Policy

Blocking (must pass):
- Chromium, Firefox, Desktop WebKit, Mobile Chrome

Non-blocking (tracked):
- Mobile Safari (known timing issue, documented)

## Backup

Push to GitHub after every significant milestone:
```bash
git push origin master
```

Repository: https://github.com/kranthiCareCareer/CareCareer (private)
