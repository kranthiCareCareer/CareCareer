# CareCareer — Phase 0 Sign-Off

Version: 1.0
Date: 2026-07-16

---

## 1. Approved Architecture

The following architectural decisions are locked and do not require further
approval before implementation begins:

| Decision Area                                | Document                         | Status   |
| -------------------------------------------- | -------------------------------- | -------- |
| Bounded contexts and service boundaries      | bounded-context-map.md           | Approved |
| Deployable-service boundaries (5 services)   | bounded-context-map.md §6        | Approved |
| Canonical identifier strategy (UUID v7)      | canonical-identifiers.md         | Approved |
| Data ownership (stage-specific)              | data-ownership-matrix.md         | Approved |
| Migration waves (0-4)                        | migration-map.md                 | Approved |
| Golden-path scope (per-diem shift lifecycle) | golden-path-backlog.md           | Approved |
| API contracts                                | golden-path-api.yaml             | Approved |
| Event contracts and envelope                 | golden-path-events.md            | Approved |
| State machines (7 lifecycles)                | golden-path-state-machines.md    | Approved |
| Error taxonomy                               | golden-path-errors.md            | Approved |
| Idempotency rules                            | idempotency-contract.md          | Approved |
| PostgreSQL RLS tenancy                       | ADR-003                          | Accepted |
| Event infrastructure (outbox + SQS/EB)       | ADR-004                          | Accepted |
| Document storage (S3/MinIO)                  | ADR-006                          | Accepted |
| API versioning (URI major)                   | ADR-007                          | Accepted |
| Legacy anti-corruption layer                 | ADR-008                          | Accepted |
| Tenant isolation requirements                | tenant-isolation-requirements.md | Approved |
| Authorization model (RBAC+ABAC)              | authorization-model.md           | Approved |
| Audit requirements                           | audit-requirements.md            | Approved |
| Data classification                          | data-classification.md           | Approved |
| Security control test matrix                 | security-control-test-matrix.md  | Approved |

---

## 2. Deferred Decisions

| Decision                                          | Default             | Required By                          | Owner             | Trigger                  |
| ------------------------------------------------- | ------------------- | ------------------------------------ | ----------------- | ------------------------ |
| EKS vs ECS                                        | Existing EKS        | Before shared AWS deployment (GP-15) | Platform Lead     | Deployment readiness     |
| Auth0 vs Cognito                                  | Auth0 (existing)    | Before pilot identity config (GP-03) | Security Lead     | Shared environment setup |
| DynamoDB adoption                                 | PostgreSQL only     | After measured load evidence         | Architecture Lead | Performance test results |
| Keycloak vs Auth0 for local dev                   | Keycloak            | Before GP-03 starts                  | Platform Lead     | Local dev setup          |
| Search infrastructure (Meilisearch vs OpenSearch) | Meilisearch locally | Before marketplace query at scale    | Platform Lead     | Scale measurement        |

All deferred decisions have:

- A documented default that allows implementation to proceed
- A deadline tied to a specific milestone
- An owner responsible for the decision
- A trigger condition that forces the decision

---

## 3. Open Discovery Items

| #   | Description                                   | Why It Matters                                    | Owner                 | Due Date     | Blocking Milestone | Resolution Evidence                         |
| --- | --------------------------------------------- | ------------------------------------------------- | --------------------- | ------------ | ------------------ | ------------------------------------------- |
| 1   | Symplr replicated DB schema completeness      | Cannot map fields without schema                  | Engineering           | Week 1 GP-14 | GP-14              | Schema document validated against live data |
| 2   | Symplr replicated DB access and freshness SLA | Shadow comparison depends on data currency        | Engineering           | Week 1 GP-14 | GP-14              | Access confirmed; freshness measured        |
| 3   | Complete pay-rule catalog (all combinations)  | Calculation accuracy depends on rule completeness | Engineering + Finance | Before GP-13 | GP-13              | Finance-reviewed rule set documented        |
| 4   | State-specific break and overtime rules       | Hour calculation correctness                      | Engineering + Legal   | Before GP-12 | GP-12              | Per-state rules documented and approved     |
| 5   | Facility geofence configurations (existing)   | Clock validation must match current behavior      | Engineering + Ops     | Before GP-11 | GP-11              | Config extracted and validated              |
| 6   | Paycom export file format and requirements    | Export preview correctness                        | Engineering + Finance | Before GP-13 | GP-13              | Format specification obtained               |
| 7   | NetSuite invoice format and integration       | Invoice preview correctness                       | Engineering + Finance | Before GP-13 | GP-13              | Format specification obtained               |
| 8   | Maestra identity mappings (completeness)      | Cannot resolve external references without        | Engineering           | Before GP-06 | GP-06              | Mapping table exported and validated        |
| 9   | Current Kafka topic schemas                   | Migration adapter correctness                     | Engineering           | Before GP-14 | GP-14              | Live messages captured and documented       |
| 10  | Mobile app deployment process                 | App store update required for new APIs            | DevOps                | Before GP-11 | GP-11              | Credentials and process documented          |
| 11  | Symplr contract terms on data usage           | Legal block if usage not permitted                | Legal                 | Before GP-14 | GP-14              | Legal confirmation obtained                 |
| 12  | Historical-retention obligations              | Affects archival strategy                         | Legal + Compliance    | Before GP-15 | GP-15              | Retention schedule documented               |
| 13  | Production data volumes (shifts/day, workers) | Capacity planning for pilot                       | Engineering + Ops     | Before GP-15 | GP-15              | Volume report from Symplr/Maestra           |
| 14  | Clock correction procedures (current)         | Must preserve operational behavior                | Ops                   | Before GP-12 | GP-12              | Procedure documented                        |
| 15  | Timecard approval roles (current mapping)     | Authorization config accuracy                     | Ops                   | Before GP-12 | GP-12              | Role mapping documented                     |

---

## 4. Phase 0 Exit Checklist

| #   | Criterion                                            | Status           |
| --- | ---------------------------------------------------- | ---------------- |
| 1   | All architecture artifacts committed to repository   | ✓                |
| 2   | All cross-document conflicts resolved                | ✓                |
| 3   | Architecture review completed                        | Pending sign-off |
| 4   | Security review completed                            | Pending sign-off |
| 5   | Product/operations review completed                  | Pending sign-off |
| 6   | Finance review for calculation boundaries            | Pending sign-off |
| 7   | Deferred decisions have deadlines and defaults       | ✓                |
| 8   | Open risks have owners and due dates                 | ✓                |
| 9   | Backlog is ordered and dependency-aware              | ✓                |
| 10  | First two slices (GP-00, GP-01) ready for assignment | ✓                |
| 11  | Definition of done agreed at all four levels         | ✓                |
| 12  | Security controls mapped to milestones               | ✓                |
| 13  | Traceability matrix covers golden-path requirements  | ✓                |

---

## 5. Signatories

| Role                   | Responsibility                             | Sign-Off     |
| ---------------------- | ------------------------------------------ | ------------ |
| Executive Sponsor      | Business investment approval               | **\_\_\_\_** |
| Product Owner          | Scope, priority, acceptance criteria       | **\_\_\_\_** |
| Architecture Owner     | Technical decisions, bounded contexts      | **\_\_\_\_** |
| Engineering Owner      | Implementation plan, team readiness        | **\_\_\_\_** |
| Security Owner         | Security controls, compliance requirements | **\_\_\_\_** |
| Operations Owner       | Operational readiness, pilot support       | **\_\_\_\_** |
| Finance Representative | Pay/bill calculation boundary approval     | **\_\_\_\_** |
| Migration Owner        | Legacy coexistence, reconciliation plan    | **\_\_\_\_** |

---

## 6. What Phase 0 Does NOT Claim

- It does not claim every question is resolved (Section 3 lists unknowns explicitly)
- It does not commit to specific dates (estimates are planning ranges)
- It does not guarantee Symplr access (listed as critical dependency)
- It does not replace operational sign-off (required at pilot-ready milestone)
- It does not authorize production cutover (separate decision with evidence)

Phase 0 establishes the engineering framework within which implementation
proceeds safely. Operational decisions (cutover, retirement, scope expansion)
require evidence from running software, not architecture documents.

---

## 7. Next Steps

Upon sign-off, engineering begins:

1. **Immediately:** GP-00 (repository baseline) and GP-01 (service template)
2. **In parallel:** Discovery items 1-8 (access confirmation, schema mapping, rule catalog)
3. **Week 2:** GP-02 (platform-service) and GP-03 (identity-service)
4. **Week 2-3:** GP-05 and GP-06 (facility and worker — parallel track)
5. **Continuous:** Review open discovery items weekly; unblock before dependent slice starts
