# CareCareer — Data Classification

Version: 1.0
Status: Phase 0 Architecture Lock
Date: 2026-07-16

---

## 1. Classification Levels

| Classification                     | Description                                                   | Examples                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **PUBLIC**                         | Information intended for public consumption                   | Published job postings, facility names (public-facing), platform marketing content                            |
| **INTERNAL**                       | Operational data not meant for public but low-risk if exposed | Configuration settings, operational metrics, feature flags, internal documentation                            |
| **CONFIDENTIAL**                   | Business-sensitive data requiring controlled access           | Client contracts, pay/bill rates, internal communications, performance scores, recruiter notes, shift details |
| **RESTRICTED — PII**               | Personally identifiable information                           | Worker full name, email, phone, address, date of birth, government ID references                              |
| **RESTRICTED — Health/Compliance** | Medical and occupational health records                       | Drug test results, medical clearances, physical exam records, TB test results                                 |
| **RESTRICTED — Financial**         | Financial account and compensation data                       | Pay rates, bank references (if any), SSN-related records, invoice amounts, earnings details                   |
| **SECURITY-SENSITIVE**             | System security information                                   | API keys, tokens, passwords, encryption keys, access logs, policy configurations, incident details            |

---

## 2. Handling Rules Per Classification

### PUBLIC

| Control                | Requirement             |
| ---------------------- | ----------------------- |
| Encryption at rest     | Standard (volume-level) |
| Encryption in transit  | TLS 1.2+                |
| Access rules           | No restriction          |
| Logging restrictions   | None                    |
| Retention              | Per business need       |
| Deletion               | Standard                |
| Export controls        | None                    |
| Non-production masking | Not required            |
| AI processing          | Permitted               |

### INTERNAL

| Control                | Requirement                       |
| ---------------------- | --------------------------------- |
| Encryption at rest     | Standard (volume-level)           |
| Encryption in transit  | TLS 1.2+                          |
| Access rules           | Authenticated users within tenant |
| Logging restrictions   | None                              |
| Retention              | 3 years or per policy             |
| Deletion               | Standard soft-delete              |
| Export controls        | Tenant-scoped                     |
| Non-production masking | Not required                      |
| AI processing          | Permitted                         |

### CONFIDENTIAL

| Control                | Requirement                                           |
| ---------------------- | ----------------------------------------------------- |
| Encryption at rest     | AES-256 (database-level or column-level)              |
| Encryption in transit  | TLS 1.3                                               |
| Access rules           | Role-based; need-to-know within tenant                |
| Logging restrictions   | Log access events; do not log values in debug         |
| Retention              | 7 years for financial; 3 years for other              |
| Deletion               | Soft-delete with retention hold                       |
| Export controls        | Authorized export only; audit trail                   |
| Non-production masking | Recommended (realistic fakes)                         |
| AI processing          | Permitted with tenant scope; no cross-tenant training |

### RESTRICTED — PII

| Control                | Requirement                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| Encryption at rest     | Column-level encryption (AES-256-GCM) for SSN; field-level for others  |
| Encryption in transit  | TLS 1.3; mTLS between services                                         |
| Access rules           | Strict role-based; minimum necessary fields exposed per role           |
| Logging restrictions   | NEVER log field values; log access events only                         |
| Retention              | Per state privacy law (typically 3-7 years post-relationship)          |
| Deletion               | Hard-delete on tenant data deletion request (right to delete)          |
| Export controls        | Explicit consent or legal basis required; audit trail                  |
| Non-production masking | MANDATORY — synthetic data or irreversible anonymization               |
| AI processing          | De-identified only; never in prompts or agent context with real values |

### RESTRICTED — Health/Compliance

| Control                | Requirement                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| Encryption at rest     | Column-level encryption                                                       |
| Encryption in transit  | TLS 1.3; mTLS                                                                 |
| Access rules           | HIPAA minimum necessary; limited to credentialing/compliance roles            |
| Logging restrictions   | NEVER log field values; log access with reason                                |
| Retention              | Per HIPAA (6 years minimum) and state law                                     |
| Deletion               | Legal hold takes precedence; otherwise per retention policy                   |
| Export controls        | HIPAA authorization required for external disclosure                          |
| Non-production masking | MANDATORY — no real health data in non-production                             |
| AI processing          | PROHIBITED unless de-identified per HIPAA Safe Harbor or Expert Determination |

### RESTRICTED — Financial

| Control                | Requirement                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| Encryption at rest     | Column-level for bank/SSN references; table-level for rates            |
| Encryption in transit  | TLS 1.3                                                                |
| Access rules           | Finance and payroll roles only; worker sees own data only              |
| Logging restrictions   | Log amounts only in aggregated audit; never individual values in debug |
| Retention              | 7 years (financial records)                                            |
| Deletion               | Retention hold; no early deletion for financial records                |
| Export controls        | Finance-approved export paths only; audit trail                        |
| Non-production masking | MANDATORY — synthetic financial data                                   |
| AI processing          | Aggregated/anonymized only; never individual financial data in prompts |

### SECURITY-SENSITIVE

| Control                | Requirement                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| Encryption at rest     | KMS-managed keys with automatic rotation                            |
| Encryption in transit  | TLS 1.3; never transmitted in URL parameters                        |
| Access rules           | Infrastructure roles only; application code never reads raw secrets |
| Logging restrictions   | NEVER log values; log rotation events only                          |
| Retention              | Rotate regularly; retain audit of rotations                         |
| Deletion               | Immediate revocation on compromise                                  |
| Export controls        | PROHIBITED                                                          |
| Non-production masking | Separate non-production secrets (never share with production)       |
| AI processing          | PROHIBITED — never in prompts, context, or training data            |

---

## 3. Field-Level Classification (Golden Path Entities)

### Worker

| Field                                       | Classification                      |
| ------------------------------------------- | ----------------------------------- |
| id, tenantId, status, displayId             | INTERNAL                            |
| firstName, lastName                         | RESTRICTED — PII                    |
| email, phone                                | RESTRICTED — PII                    |
| address                                     | RESTRICTED — PII                    |
| dateOfBirth                                 | RESTRICTED — PII                    |
| ssn (if stored)                             | RESTRICTED — PII (column-encrypted) |
| roles, preferredFacilities, maxCommuteMiles | INTERNAL                            |

### Credential

| Field                                  | Classification      |
| -------------------------------------- | ------------------- |
| id, workerId, credentialTypeId, status | INTERNAL            |
| licenseNumber                          | CONFIDENTIAL        |
| issuingState, issuedAt, expiresAt      | INTERNAL            |
| documentUrl (pre-signed)               | CONFIDENTIAL        |
| verificationResult                     | INTERNAL            |
| drugTestResult (if stored)             | RESTRICTED — Health |
| backgroundCheckResult                  | RESTRICTED — Health |

### Shift / Assignment

| Field                               | Classification         |
| ----------------------------------- | ---------------------- |
| id, facilityId, status, times, role | INTERNAL               |
| payRate                             | RESTRICTED — Financial |
| billRate                            | RESTRICTED — Financial |
| workerId (in assignment)            | CONFIDENTIAL           |

### Timecard / Calculation

| Field                           | Classification         |
| ------------------------------- | ---------------------- |
| id, assignmentId, status, hours | CONFIDENTIAL           |
| payAmount, billAmount           | RESTRICTED — Financial |
| lineItems (with rates)          | RESTRICTED — Financial |

### Clock Event

| Field                             | Classification               |
| --------------------------------- | ---------------------------- |
| id, assignmentId, type, timestamp | INTERNAL                     |
| coordinates (GPS)                 | CONFIDENTIAL (location data) |
| deviceId                          | INTERNAL                     |

---

## 4. API Response Classification

API responses MUST NOT return:

- SSN or government ID numbers (NEVER in any API response)
- Full background check results (status only: PASS/FAIL/PENDING)
- Drug test results (status only: PASS/FAIL/PENDING)
- Raw credential document content (pre-signed URL with short TTL only)
- Internal database IDs from other tenants
- Stack traces or internal error details
- Other tenants' data in any form

API responses MAY return:

- Worker name, email (to authorized roles within the same tenant)
- Pay/bill rates (to finance roles only)
- Credential status and expiry (to relevant operational roles)
- Aggregated financial totals (to authorized finance roles)
