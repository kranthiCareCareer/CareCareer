# CareCareer — Tenant Isolation Requirements

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Isolation Controls by Layer

| Layer                  | Control                                              | Implementation                                                 |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Authentication         | Token contains verified tenantId                     | OIDC provider embeds tenant claim; identity-service validates  |
| Authorization          | Permission evaluated within tenant scope             | ABAC policy includes `tenant_id = token.tenantId`              |
| API request context    | tenantId extracted from JWT, never from request body | Middleware extracts and sets context before handler            |
| Database (RLS)         | Every query scoped by tenant_id                      | `SET LOCAL app.tenant_id`; RLS policy enforces                 |
| Cache keys             | Tenant-prefixed keys                                 | `{tenantId}:{service}:{key}`                                   |
| Queue messages         | Event envelope carries tenantId                      | Outbox writes tenantId; consumer validates                     |
| Event envelopes        | tenantId is mandatory field                          | Event schema enforces; consumer rejects if missing             |
| Object storage (S3)    | Tenant-prefixed object keys                          | `{tenantId}/{domain}/{entityId}/{file}`                        |
| Search indexes         | Tenant field on every document                       | Query filter includes tenantId; index-level isolation optional |
| Logs and traces        | tenantId in structured log context                   | Logger middleware injects; never used for access control       |
| Exports                | Scoped to requesting tenant                          | Export queries include RLS; file stored in tenant prefix       |
| Administrative tooling | Cross-tenant access requires elevation               | Break-glass with reason, approval, audit, and TTL              |

---

## 2. Mandatory Negative Tests

These tests MUST run in CI and MUST pass before any deployment:

### 2.1 Direct Access Attempts

| Test                                                            | Expected Result                                  |
| --------------------------------------------------------------- | ------------------------------------------------ |
| Tenant A requests Tenant B's resource by guessed UUID           | 404 Not Found (not 403 — no information leakage) |
| Tenant A lists resources — Tenant B's resources absent          | Empty or filtered result                         |
| Tenant A attempts to create resource with Tenant B's facilityId | 404 (facilityId not found in Tenant A's scope)   |

### 2.2 Header Manipulation

| Test                                                    | Expected Result                       |
| ------------------------------------------------------- | ------------------------------------- |
| Worker changes X-Tenant-ID header to different tenant   | Ignored; tenant derived from JWT only |
| Request with no JWT                                     | 401 Unauthorized                      |
| Request with JWT for suspended tenant                   | 403 Tenant Inactive                   |
| Request with valid JWT but resource in different tenant | 404 Not Found                         |

### 2.3 Queue and Event Isolation

| Test                                             | Expected Result                     |
| ------------------------------------------------ | ----------------------------------- |
| Event published without tenantId                 | Outbox rejects; event not published |
| Consumer receives event with mismatched tenantId | Consumer rejects; routes to DLQ     |
| Queue message lacks tenant context               | Consumer rejects; alert raised      |

### 2.4 Background Job Isolation

| Test                                                              | Expected Result                      |
| ----------------------------------------------------------------- | ------------------------------------ |
| Background job attempts query without SET LOCAL tenant            | RLS returns empty result set         |
| Background job attempts to process data for wrong tenant          | Job fails; alert raised              |
| Scheduled job (e.g., credential expiry) processes only its tenant | Only own-tenant credentials affected |

### 2.5 Cache Isolation

| Test                                                    | Expected Result                                   |
| ------------------------------------------------------- | ------------------------------------------------- |
| Tenant A's cached data requested under Tenant B context | Cache miss (different key prefix)                 |
| Cache key without tenant prefix                         | Rejected by cache wrapper (key format validation) |

### 2.6 Storage Isolation

| Test                                                    | Expected Result                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Pre-signed URL for Tenant A's document used by Tenant B | URL is valid (S3 doesn't know tenants) but application validates tenant match on download confirmation |
| Direct S3 access attempt (no pre-signed URL)            | Bucket policy denies public access                                                                     |

### 2.7 Search Isolation

| Test                                                      | Expected Result                                  |
| --------------------------------------------------------- | ------------------------------------------------ |
| Search query without tenant filter                        | Search adapter rejects (tenant filter mandatory) |
| Search results include only requesting tenant's documents | Verified by cross-tenant search test             |

---

## 3. Failure Modes and Responses

| Failure Mode                               | Detection                        | Response                                       |
| ------------------------------------------ | -------------------------------- | ---------------------------------------------- |
| RLS not set (missing SET LOCAL)            | Query returns empty unexpectedly | Application guard rejects; alert raised        |
| Wrong tenant in context                    | Data mismatch in business logic  | Transaction rolled back; correlation ID logged |
| Tenant context lost in async               | Consumer validation fails        | Message routed to DLQ; alert raised            |
| Cache poisoning (wrong tenant data cached) | Periodic cache audit job         | Invalidate affected keys; alert raised         |
| Cross-tenant data in search index          | Reconciliation detects mismatch  | Reindex affected documents; alert raised       |

---

## 4. Administrative Cross-Tenant Access

Cross-tenant access is deny-by-default. When operationally necessary:

1. **Requires:** Break-glass role activation with documented reason
2. **Approval:** Required for CONFIDENTIAL/RESTRICTED data access
3. **Audit:** Every cross-tenant action recorded with actor, reason, resources, and duration
4. **TTL:** Elevation expires automatically (max 4 hours)
5. **Monitoring:** Alert on any cross-tenant access; review weekly
6. **Tooling:** Separate administrative credentials; never the application role
