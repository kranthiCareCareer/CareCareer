# CareCareer — Definition of Done

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Story-Level Done

A story is complete when ALL of the following are true:

| #   | Criterion                                  | Evidence                                             |
| --- | ------------------------------------------ | ---------------------------------------------------- |
| 1   | Acceptance criteria pass                   | Automated tests or manual demonstration              |
| 2   | Unit tests present and passing             | CI green                                             |
| 3   | Integration tests present where applicable | CI green                                             |
| 4   | Code review approved                       | PR approval from qualified reviewer                  |
| 5   | No secrets or sensitive data in logs       | Log output inspection + DP-004 test                  |
| 6   | API contract remains compatible            | Consumer-driven contract test passes                 |
| 7   | Event contract remains compatible          | Event schema validation passes                       |
| 8   | Audit behavior tested (where applicable)   | Audit record produced for mutations                  |
| 9   | Tenant isolation tested (where applicable) | Cross-tenant negative test passes                    |
| 10  | Documentation updated                      | README, API docs, or ADR updated if behavior changed |
| 11  | No lint warnings                           | `pnpm lint` clean                                    |
| 12  | No type errors                             | `pnpm type-check` clean                              |
| 13  | No `console.log`, `any`, `@ts-ignore`      | ESLint rules enforce                                 |
| 14  | Commit messages follow conventional format | commitlint passes                                    |

---

## 2. Slice-Level Done

A slice additionally requires ALL of the following beyond story-level:

| #   | Criterion                                                | Evidence                                          |
| --- | -------------------------------------------------------- | ------------------------------------------------- |
| 1   | End-to-end workflow demonstrated                         | E2E test or recorded demonstration                |
| 2   | Operational metrics emitting                             | Metrics endpoint shows RED metrics                |
| 3   | Structured logging verified                              | Logs contain correlationId, tenantId, service     |
| 4   | Trace propagation verified                               | Trace spans visible across HTTP → DB → event      |
| 5   | Error taxonomy compliance                                | All errors use golden-path-errors.md codes        |
| 6   | Idempotency validated                                    | Repeat mutation returns original result           |
| 7   | Database migration runs forward and backward             | `db:migrate` and `db:rollback` both succeed       |
| 8   | Security-control mapping complete                        | Controls from test matrix mapped to this slice    |
| 9   | Accessibility checks for UI (where applicable)           | axe-core or equivalent passes                     |
| 10  | Reconciliation behavior verified (where legacy involved) | Comparison produces expected match/mismatch       |
| 11  | Performance acceptable                                   | p95 < 500ms for API endpoints in slice            |
| 12  | No flaky tests                                           | Tests pass 10 consecutive runs                    |
| 13  | Docker Compose local execution works                     | `docker compose up` + service starts + tests pass |

"Works locally" alone does NOT satisfy slice-level done once GP-15 is complete.
After GP-15, the slice must also deploy successfully to the shared AWS environment.

---

## 3. Pilot-Ready Done

Before the golden-path pilot can run, ALL of the following must be true:

| #   | Criterion                                    | Evidence                                                  |
| --- | -------------------------------------------- | --------------------------------------------------------- |
| 1   | Shared AWS environment operational           | Services deployed and healthy                             |
| 2   | Monitoring and alerting active               | Dashboards show metrics; alerts fire on failure           |
| 3   | Backup and restore tested                    | Restore executed; data verified                           |
| 4   | Runbook exists per service                   | Documented: start, stop, debug, rollback, escalate        |
| 5   | On-call ownership assigned                   | Named individuals for pilot support                       |
| 6   | Security review completed                    | Security control test matrix — all "Before Pilot" items ✓ |
| 7   | Performance baseline established             | Load test results documented                              |
| 8   | Data-retention configuration applied         | Retention classes from data-classification.md configured  |
| 9   | Migration rehearsal completed                | Seed → shadow → comparison cycle executed                 |
| 10  | Operational training delivered               | Schedulers, approvers trained on new workflow             |
| 11  | Business-owner approval recorded             | Product and operations sign-off documented                |
| 12  | Rollback tested                              | Revert to legacy demonstrated within target time          |
| 13  | Reconciliation thresholds met                | 14 consecutive days of passing comparisons                |
| 14  | No unresolved high/critical security defects | Security backlog clear                                    |

---

## 4. Production-Ready Done

Before CareCareer becomes system-of-record (post-pilot cutover):

| #   | Criterion                                   | Evidence                                             |
| --- | ------------------------------------------- | ---------------------------------------------------- |
| 1   | SLOs defined and measured                   | Availability, latency, error rate targets documented |
| 2   | Capacity tested                             | Load test at 2× expected pilot volume passes         |
| 3   | DR validated                                | Multi-AZ failover tested; RTO/RPO met                |
| 4   | Incident-response integrated                | Alerts → PagerDuty/equivalent → runbook → escalation |
| 5   | Vulnerability scans clean                   | Container, dependency, SAST scans pass               |
| 6   | Penetration test disposition                | Findings addressed or accepted with risk             |
| 7   | Access review completed                     | All human and service accounts reviewed              |
| 8   | Backup restore evidence                     | Point-in-time restore demonstrated                   |
| 9   | Change-management approval                  | Release approved through change process              |
| 10  | Rollback rehearsed                          | Production rollback demonstrated in staging          |
| 11  | Support documentation complete              | Operations, support team can handle incidents        |
| 12  | Data-processing review                      | Privacy impact assessed; HIPAA controls confirmed    |
| 13  | Reconciliation: 30 consecutive days passing | All domains at threshold                             |
| 14  | Finance sign-off                            | Pay/bill accuracy approved                           |
| 15  | Operations sign-off                         | Workflow completeness approved                       |
| 16  | Rollback window defined                     | 14-day minimum post-cutover                          |

---

## 5. What Is NOT Done

| Condition                           | Why                                           |
| ----------------------------------- | --------------------------------------------- |
| "Works on my machine"               | Must work in CI and shared environment        |
| "Tests pass sometimes"              | Flaky tests are bugs                          |
| "Docs will be updated later"        | Documentation debt compounds                  |
| "Security can be added later"       | Security is part of implementation            |
| "We'll handle that edge case later" | If it's in acceptance criteria, it's now      |
| "The happy path works"              | Error paths and tenant isolation are required |
| "It's in the PR"                    | PR must be approved AND merged                |
