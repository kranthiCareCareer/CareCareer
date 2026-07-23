# GP-00 through GP-09 — Truthful Gap Assessment

## Last Updated: 2026-07-23

## Executive Summary

Many milestones were marked COMPLETE based on domain code and unit tests rather than verified operational vertical slices. This document records what actually works through the running system.

## Assessment Matrix

| GP  | Capability              | Code | Module | DB  | RLS | Auth | Audit | Outbox | API | UI  | Int.Test | E2E | Status                          |
| --- | ----------------------- | :--: | :----: | :-: | :-: | :--: | :---: | :----: | :-: | :-: | :------: | :-: | ------------------------------- |
| 00  | CI/CD pipelines         |  ✅  |  N/A   | N/A | N/A | N/A  |  N/A  |  N/A   | N/A | N/A |   N/A    | N/A | OPERATIONAL                     |
| 01  | Service template        |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | N/A | N/A |    ✅    | N/A | OPERATIONAL                     |
| 02  | Tenant provisioning     |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ✅  |    ✅    | ✅  | OPERATIONAL                     |
| 03  | Identity/auth           |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | N/A |    ✅    | N/A | OPERATIONAL                     |
| 04  | Admin portal            |  ✅  |  N/A   | N/A | N/A |  ✅  |  N/A  |  N/A   | N/A | ✅  |   N/A    | ✅  | OPERATIONAL                     |
| 05  | Facilities              |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ❌  |    ✅    | ❌  | API_OPERATIONAL                 |
| 05  | Departments             |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ❌  |    ✅    | ❌  | API_OPERATIONAL                 |
| 05  | Credential requirements |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ❌   |   ❌   | ✅  | ❌  |    ✅    | ❌  | API_PARTIAL                     |
| 06  | Workers CRUD            |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ❌  |    ✅    | ❌  | API_OPERATIONAL                 |
| 06  | Worker self-service     |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ❌  |    ✅    | ❌  | API_OPERATIONAL                 |
| 07  | Credentials CRUD        |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ❌  |    ✅    | ❌  | COMPONENT_INTEGRATION_VALIDATED |
| 07  | Eligibility eval        |  ✅  |   ✅   | ✅  | ✅  |  ✅  |  ✅   |   ✅   | ✅  | ❌  |    ✅    | ❌  | COMPONENT_INTEGRATION_VALIDATED |
| 08  | Shift creation          |  ✅  |   ❌   | ✅  | ✅  |  ❌  |  ❌   |   ❌   | ❌  | ❌  |    ❌    | ❌  | DOMAIN_ONLY                     |
| 08  | Shift publish/cancel    |  ✅  |   ❌   | ❌  | ❌  |  ❌  |  ❌   |   ❌   | ❌  | ❌  |    ❌    | ❌  | DOMAIN_ONLY                     |
| 09  | Marketplace query       |  ✅  |   ❌   | ❌  | ❌  |  ❌  |  ❌   |   ❌   | ❌  | ❌  |    ❌    | ❌  | DOMAIN_ONLY                     |
| 09  | Shift requests          |  ✅  |   ❌   | ✅  | ✅  |  ❌  |  ❌   |   ❌   | ❌  | ❌  |    ❌    | ❌  | DOMAIN_ONLY                     |

## Critical Findings

### 1. GP-07 Credentials: REGISTERED AND COMPONENT-TESTED (this branch)

- CredentialController registered in StaffingModule.controllers
- PostgresCredentialRepository bound to CREDENTIAL_REPOSITORY
- StaffingExceptionFilter registered as APP_FILTER
- listCredentials returns real data from PostgreSQL
- 21 credential integration tests prove HTTP + DB + RLS + auth
- Remaining: real cross-service auth, production image proof, OpenAPI

### 2. GP-08 Shifts: Domain model only, NO operational code

- `shift.ts` and `shift.spec.ts` exist with domain logic and 40 tests
- `009_shifts_schema.sql` migration exists
- NO shift repository, NO shift controller, NO module registration
- NO shift commands (create, publish, cancel)

### 3. GP-09 Marketplace: Domain model only

- `marketplace.ts` and `shift-request.ts` exist with domain logic
- `010_shift_requests_schema.sql` migration exists
- NO repository, NO controller, NO commands, NO module registration

### 4. Platform-service uses demo-only auth

- `DemoTokenValidator` is hardcoded (not conditional on environment)
- `InMemoryAuthorizationService` — no real policy engine
- Acceptable for DEMO-01, but NOT production-ready

### 5. No OpenAPI spec for staffing-service credential endpoints

- `services/staffing-service/openapi.yaml` exists but does not include credential/eligibility ops
- Credentials and shifts are missing from the spec

### 6. No UI for workforce features

- Admin console covers: tenants, organizations, entitlements, features, audit
- NO UI for: facilities, departments, workers, credentials, shifts, marketplace

### 7. CI path filters skip staffing changes

- Container Security and DEMO-01 E2E only trigger for specific paths
- Staffing-service changes don't trigger these workflows

## Repair Plan

### PR A (this branch): Stabilization

1. Register CredentialController + CREDENTIAL_REPOSITORY in StaffingModule
2. Implement listCredentials properly
3. Add shift repository + controller + module registration (operational GP-08)
4. Fix credential controller principal extraction (remove body hacks)
5. Update execution-state and README claims

### PR B (PR #9 rebase): GP-09 operational

After PR A merges, rebase and complete with:

- Marketplace repository (PostgreSQL query, not in-memory)
- Shift request repository
- Application commands with atomic confirmation
- Integration tests

### PR C: UI + E2E

- Admin UI for facilities/workers/credentials/shifts
- Playwright tests covering full workflows

## Known TODOs in Source

| File                     | Line | Content                                                       |
| ------------------------ | ---- | ------------------------------------------------------------- |
| credential.controller.ts | 98   | `// TODO: Implement credential listing within tenant context` |
