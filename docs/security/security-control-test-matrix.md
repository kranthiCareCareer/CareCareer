# CareCareer — Security Control Test Matrix

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## Purpose

Maps each security control to its implementation location, automated test,
manual evidence, responsible owner, and milestone requirement.

---

## Control Matrix

### Tenant Isolation Controls

| ID     | Requirement                                   | Implementation Location  | Automated Test                                         | Manual Evidence  | Owner         | Before Pilot | Before Prod |
| ------ | --------------------------------------------- | ------------------------ | ------------------------------------------------------ | ---------------- | ------------- | :----------: | :---------: |
| TI-001 | tenant_id on every tenant-owned table         | Database schema (Prisma) | Schema validation test                                 | Schema review    | DB Lead       |      ✓       |      ✓      |
| TI-002 | RLS enabled and forced on tenant tables       | PostgreSQL DDL           | RLS policy existence test                              | DBA review       | DB Lead       |      ✓       |      ✓      |
| TI-003 | Application role cannot BYPASSRLS             | PostgreSQL role config   | Role privilege test                                    | DBA review       | DB Lead       |      ✓       |      ✓      |
| TI-004 | SET LOCAL tenant context in every transaction | Repository wrapper       | Integration test (query without context returns empty) | Code review      | Platform Lead |      ✓       |      ✓      |
| TI-005 | Cross-tenant query returns empty              | Application code         | Negative test: Tenant A queries Tenant B's data        | Penetration test | Security Lead |      ✓       |      ✓      |
| TI-006 | Tenant from JWT, never request body           | Auth middleware          | Unit test: tampered X-Tenant-ID ignored                | Code review      | Platform Lead |      ✓       |      ✓      |
| TI-007 | Cache keys tenant-prefixed                    | Cache adapter            | Unit test: key format validation                       | Code review      | Platform Lead |      ✓       |      ✓      |
| TI-008 | S3 keys tenant-prefixed                       | Storage adapter          | Integration test: upload creates correct prefix        | Code review      | Platform Lead |      ✓       |      ✓      |
| TI-009 | Events carry tenantId                         | Event outbox             | Outbox rejects event without tenantId                  | Code review      | Platform Lead |      ✓       |      ✓      |
| TI-010 | Background jobs scoped to tenant              | Job framework            | Job fails without explicit tenantId                    | Code review      | Platform Lead |      ✓       |      ✓      |

### Authentication Controls

| ID     | Requirement                       | Implementation Location | Automated Test                                | Manual Evidence       | Owner         | Before Pilot | Before Prod |
| ------ | --------------------------------- | ----------------------- | --------------------------------------------- | --------------------- | ------------- | :----------: | :---------: |
| AU-001 | JWT signature verified (RS256+)   | Auth middleware         | Unit test: invalid signature rejected         | Security review       | Security Lead |      ✓       |      ✓      |
| AU-002 | Token expiry enforced             | Auth middleware         | Unit test: expired token rejected             | —                     | Platform Lead |      ✓       |      ✓      |
| AU-003 | JWKS rotation handled             | Auth middleware         | Integration test: rotated key accepted        | Rotation runbook      | Platform Lead |      ✓       |      ✓      |
| AU-004 | MFA required for admin roles      | IdP configuration       | E2E test: admin login requires MFA            | IdP config screenshot | Security Lead |      —       |      ✓      |
| AU-005 | No password storage in CareCareer | Application code        | Dependency scan: no bcrypt/argon2 in services | Architecture review   | Security Lead |      ✓       |      ✓      |

### Authorization Controls

| ID     | Requirement                      | Implementation Location | Automated Test                                        | Manual Evidence  | Owner         | Before Pilot | Before Prod |
| ------ | -------------------------------- | ----------------------- | ----------------------------------------------------- | ---------------- | ------------- | :----------: | :---------: |
| AZ-001 | Every mutation checks permission | Controller guards       | Unit test: missing permission returns 403             | Code review      | Platform Lead |      ✓       |      ✓      |
| AZ-002 | ABAC conditions enforced         | Policy evaluator        | Unit test: wrong facility/branch denied               | Code review      | Platform Lead |      ✓       |      ✓      |
| AZ-003 | Explicit deny overrides allow    | Policy engine           | Unit test: deny policy blocks despite allow           | —                | Platform Lead |      ✓       |      ✓      |
| AZ-004 | Break-glass produces audit       | Admin tooling           | Integration test: elevation logged                    | Audit log review | Security Lead |      —       |      ✓      |
| AZ-005 | Worker can only access own data  | Worker endpoints        | Integration test: Worker A cannot read Worker B       | Penetration test | Security Lead |      ✓       |      ✓      |
| AZ-006 | Authorization decision audited   | Audit module            | Integration test: denied action produces audit record | Audit query      | Platform Lead |      ✓       |      ✓      |

### Data Protection Controls

| ID     | Requirement                           | Implementation Location  | Automated Test                              | Manual Evidence          | Owner         | Before Pilot | Before Prod |
| ------ | ------------------------------------- | ------------------------ | ------------------------------------------- | ------------------------ | ------------- | :----------: | :---------: |
| DP-001 | TLS 1.2+ for all connections          | Infrastructure config    | TLS version test (reject TLS 1.1)           | Certificate review       | Infra Lead    |      ✓       |      ✓      |
| DP-002 | Database encrypted at rest            | Aurora/PostgreSQL config | —                                           | AWS console verification | Infra Lead    |      —       |      ✓      |
| DP-003 | S3 encrypted at rest (SSE)            | Bucket policy            | Integration test: uploaded object encrypted | AWS config review        | Infra Lead    |      ✓       |      ✓      |
| DP-004 | RESTRICTED fields never logged        | Logger config            | Unit test: logger redacts marked fields     | Log audit (grep)         | Platform Lead |      ✓       |      ✓      |
| DP-005 | No secrets in source code             | CI pipeline              | gitleaks/git-secrets scan in CI             | Scan report              | Security Lead |      ✓       |      ✓      |
| DP-006 | Pre-signed URLs short-lived (≤15 min) | Storage adapter          | Unit test: URL expiration configured        | Code review              | Platform Lead |      ✓       |      ✓      |
| DP-007 | Non-prod uses synthetic PII data      | Test fixtures/seed       | Seed scripts use faker; no real PII         | Data review              | DB Lead       |      ✓       |      ✓      |

### Audit Controls

| ID     | Requirement                               | Implementation Location       | Automated Test                                    | Manual Evidence | Owner         | Before Pilot | Before Prod |
| ------ | ----------------------------------------- | ----------------------------- | ------------------------------------------------- | --------------- | ------------- | :----------: | :---------: |
| AD-001 | Every state change produces audit record  | Domain service + audit module | Integration test: mutation → audit record exists  | Audit query     | Platform Lead |      ✓       |      ✓      |
| AD-002 | Audit table is append-only                | Database permissions          | Test: UPDATE/DELETE on audit table fails          | DBA review      | DB Lead       |      ✓       |      ✓      |
| AD-003 | Denied actions audited                    | Auth guard + audit            | Integration test: 403 → audit record with DENIED  | Audit query     | Platform Lead |      ✓       |      ✓      |
| AD-004 | Correlation ID in every audit record      | Audit module                  | Unit test: audit record contains correlationId    | —               | Platform Lead |      ✓       |      ✓      |
| AD-005 | Financial actions have enhanced retention | Audit lifecycle               | Configuration check: ENHANCED retention class set | Config review   | Platform Lead |      —       |      ✓      |

### Input Validation Controls

| ID     | Requirement                             | Implementation Location | Automated Test                             | Manual Evidence | Owner         | Before Pilot | Before Prod |
| ------ | --------------------------------------- | ----------------------- | ------------------------------------------ | --------------- | ------------- | :----------: | :---------: |
| IV-001 | All external input validated (Zod)      | DTO validation          | Unit test: invalid input returns 400       | Code review     | Platform Lead |      ✓       |      ✓      |
| IV-002 | SQL injection prevented (parameterized) | Prisma ORM              | — (Prisma parameterizes by default)        | Code review     | DB Lead       |      ✓       |      ✓      |
| IV-003 | File upload type/size validated         | Upload endpoint         | Integration test: disallowed type rejected | Code review     | Platform Lead |      ✓       |      ✓      |
| IV-004 | Malware scan before document usable     | Document pipeline       | Integration test: EICAR test file blocked  | Scan report     | Security Lead |      ✓       |      ✓      |

### Credential & Compliance Controls

| ID     | Requirement                             | Implementation Location | Automated Test                                   | Manual Evidence     | Owner       | Before Pilot | Before Prod |
| ------ | --------------------------------------- | ----------------------- | ------------------------------------------------ | ------------------- | ----------- | :----------: | :---------: |
| CC-001 | Expired credential blocks assignment    | Eligibility engine      | Unit test: expired → INELIGIBLE                  | —                   | Domain Lead |      ✓       |      ✓      |
| CC-002 | Expired credential blocks clock-in      | Clock event handler     | Integration test: clock-in rejected              | —                   | Domain Lead |      ✓       |      ✓      |
| CC-003 | OIG/SAM exclusion immediately blocks    | Eligibility engine      | Unit test: exclusion → BLOCKED                   | —                   | Domain Lead |      ✓       |      ✓      |
| CC-004 | Eligibility is deterministic (never AI) | Eligibility engine      | Code review: no ML/LLM calls in eligibility path | Architecture review | CTO         |      ✓       |      ✓      |
| CC-005 | Every eligibility evaluation recorded   | Audit + event           | Integration test: evaluation → audit + event     | Audit query         | Domain Lead |      ✓       |      ✓      |

### Financial Controls

| ID     | Requirement                                 | Implementation Location | Automated Test                                      | Manual Evidence  | Owner          | Before Pilot | Before Prod |
| ------ | ------------------------------------------- | ----------------------- | --------------------------------------------------- | ---------------- | -------------- | :----------: | :---------: |
| FI-001 | Pay/bill calculations are deterministic     | Calculation engine      | Decision-table tests for all rule types             | Finance review   | Domain Lead    |      ✓       |      ✓      |
| FI-002 | Completed calculations never mutated        | Calculation service     | Integration test: update attempt on COMPLETED fails | Code review      | Domain Lead    |      ✓       |      ✓      |
| FI-003 | Calculation version tracks timecard version | Calculation service     | Unit test: version mismatch detected                | —                | Domain Lead    |      ✓       |      ✓      |
| FI-004 | Financial reconciliation against Symplr     | Reconciliation service  | Reconciliation run produces comparison report       | Finance sign-off | Migration Lead |      ✓       |      ✓      |
| FI-005 | No financial posting without sign-off       | Export service          | Export is preview-only; no auto-posting             | Process review   | Finance        |      ✓       |      ✓      |

---

## Evidence Collection Schedule

| Milestone                 | Evidence Required                                             |
| ------------------------- | ------------------------------------------------------------- |
| Service template complete | TI-001 through TI-010, AU-001/002/005, AZ-001/002, IV-001/002 |
| Platform spine complete   | All AU-_, all AZ-_, AD-001 through AD-004                     |
| Golden path complete      | All CC-_, all FI-_, DP-004/007, TI-005 (full cross-tenant)    |
| Before pilot deployment   | All "Before Pilot" columns marked ✓                           |
| Before production         | All columns marked ✓                                          |

---

## Gaps and Risks

| Gap                                 | Mitigation                                                | Deadline                       |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------ |
| Penetration testing not automated   | Schedule manual pentest before pilot                      | 2 weeks before pilot           |
| HIPAA BAA not in place for pilot    | Confirm BAA with AWS; assess if PHI is processed in pilot | Before pilot if PHI involved   |
| Malware scanning infra not selected | ClamAV for local; evaluate AWS solutions                  | Before document upload feature |
| Break-glass tooling not built       | Manual process with audit for pilot; tooling in H2        | H2                             |
