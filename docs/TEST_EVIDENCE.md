# CareCareer Test Evidence

## Latest Run: 2026-07-24

## Acceptance Test — 20/20 PASS

Executed against live Docker Compose services (PostgreSQL + all APIs):

| Step | Description                       | Result |
| ---- | --------------------------------- | ------ |
| 1    | Admin signs in (demo token)       | ✅     |
| 2    | Admin opens seeded facility       | ✅     |
| 3    | Admin opens seeded worker         | ✅     |
| 4    | Worker credentials verified       | ✅     |
| 5    | Worker eligible                   | ✅     |
| 6    | Client creates + publishes shift  | ✅     |
| 7    | Worker sees shift in marketplace  | ✅     |
| 8    | Worker requests shift             | ✅     |
| 9    | Client confirms worker            | ✅     |
| 10   | Assignment created atomically     | ✅     |
| 11   | Worker clocks in                  | ✅     |
| 12   | Worker records break              | ✅     |
| 13   | Worker clocks out                 | ✅     |
| 14   | Worker submits timecard           | ✅     |
| 15   | Client approves timecard          | ✅     |
| 16   | Notifications delivered (MailHog) | ✅     |
| 17   | Admin sees audit history          | ✅     |
| 18   | Cross-tenant denied               | ✅     |
| 19   | Duplicate prevented               | ✅     |
| 20   | Stale version returns 409         | ✅     |

## Authorization Evidence

| Test                          | Result                  |
| ----------------------------- | ----------------------- |
| Admin has full permissions    | ✅ 200 on all endpoints |
| Worker denied shift creation  | ✅ 403 Forbidden        |
| Worker can access marketplace | ✅ 200                  |
| Client denied admin audit     | ✅ 403 Forbidden        |
| Cross-tenant user denied      | ✅ 401 Unauthorized     |
| Invalid token rejected        | ✅ 401                  |

## Notification Evidence

| Metric                       | Value                       |
| ---------------------------- | --------------------------- |
| In-app notifications created | 2 (confirmation + approval) |
| Emails in MailHog            | 2                           |
| Email 1 subject              | "Shift Request Confirmed"   |
| Email 2 subject              | "Timecard Approved"         |
| PHI in bodies                | None (verified by test)     |

## Unit Test Summary

| Service                | Tests   | Status       |
| ---------------------- | ------- | ------------ |
| staffing-service       | 369     | ✅ PASS      |
| identity-service       | 237     | ✅ PASS      |
| platform-admin-console | 103     | ✅ PASS      |
| **Total**              | **709** | **ALL PASS** |

## Domain Coverage

| Domain                     | Tests | Key Coverage                                        |
| -------------------------- | ----- | --------------------------------------------------- |
| Shift state machine        | 40    | Every valid + invalid transition                    |
| ShiftRequest state machine | 18    | REQUESTED→CONFIRMED/REJECTED/WITHDRAWN/EXPIRED      |
| Assignment lifecycle       | 19    | CONFIRMED→CHECKED_IN→COMPLETED, cancellation        |
| Timekeeping                | 25    | Clock sequence, break calc, timecard submit/approve |
| Credential lifecycle       | 51    | UPLOADED→VERIFIED→EXPIRED, rejection, revocation    |
| Eligibility evaluation     | 27    | Deterministic outcomes, reason codes                |

## Quality Gates

| Gate                   | Status                    |
| ---------------------- | ------------------------- |
| TypeScript strict      | ✅ All services           |
| ESLint (0 errors)      | ✅                        |
| Prettier               | ✅                        |
| Unit tests             | ✅ 709 passing            |
| OpenAPI validation     | ✅ 15 specs               |
| Docker build           | ✅ All images             |
| Container health       | ✅ 7/7 healthy            |
| Acceptance workflow    | ✅ 20/20                  |
| MailHog delivery       | ✅ 2 emails               |
| RLS isolation          | ✅ Cross-tenant denied    |
| Permission enforcement | ✅ Role boundaries proven |

## Reproducibility

```
make demo-up     → 7 containers healthy (verified)
make demo-seed   → 15 migrations + synthetic data (verified)
make demo-test   → 20/20 PASS (verified)
make demo-reset  → destroy + rebuild (verified)
make demo-test   → 20/20 PASS again (verified)
```
