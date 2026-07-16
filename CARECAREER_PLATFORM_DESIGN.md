# CareCareer Platform Design — Complete System Blueprint

## 1. Platform Vision

CareCareer is an AI-native healthcare workforce operating system that replaces
fragmented point solutions (Bullhorn for ATS, Symplr for credentialing, LaborEdge
for scheduling) with a single, multi-tenant platform. It combines traditional
staffing workflows with intelligent AI agents (inspired by Sense AI) to automate
recruiting, matching, engagement, and operations.

---

## 2. Core Personas & Roles

### 2.1 Role Hierarchy

```
PLATFORM_SUPER_ADMIN (CareCareer internal)
│
├── TENANT_OWNER (Staffing Agency Owner / Health System Admin)
│   ├── TENANT_ADMIN (IT Admin, configures tenant)
│   │
│   ├── OPERATIONS
│   │   ├── RECRUITER (sources, screens, submits candidates)
│   │   ├── SENIOR_RECRUITER (approval authority)
│   │   ├── ACCOUNT_MANAGER (client relationship, job orders)
│   │   ├── SCHEDULING_COORDINATOR (shift management)
│   │   ├── CREDENTIALING_SPECIALIST (license/compliance)
│   │   ├── PAYROLL_ADMINISTRATOR (time/pay processing)
│   │   ├── BILLING_SPECIALIST (invoicing/AR)
│   │   └── COMPLIANCE_OFFICER (audit, risk)
│   │
│   ├── MANAGEMENT
│   │   ├── BRANCH_MANAGER (office-level oversight)
│   │   ├── REGIONAL_DIRECTOR (multi-branch)
│   │   └── VP_OPERATIONS (enterprise view)
│   │
│   └── ANALYTICS
│       ├── FINANCIAL_ANALYST
│       └── EXECUTIVE (read-only dashboards)
│
├── CLIENT (Healthcare Facility)
│   ├── CLIENT_ADMIN (facility configuration)
│   ├── HIRING_MANAGER (job orders, approvals)
│   ├── NURSE_MANAGER (unit-level scheduling)
│   ├── TIMECARD_APPROVER (approve worked hours)
│   └── CLIENT_VIEWER (reports only)
│
├── CANDIDATE / WORKER
│   ├── APPLICANT (pre-hire)
│   ├── ACTIVE_WORKER (placed, working shifts)
│   ├── INACTIVE_WORKER (between assignments)
│   └── ALUMNI (past worker, re-engageable)
│
└── SUPPLIER / VENDOR (for VMS/MSP)
    ├── SUPPLIER_ADMIN
    ├── SUPPLIER_RECRUITER
    └── SUPPLIER_VIEWER
```

### 2.2 Permission Model (RBAC + ABAC)

The system uses a hybrid permission model:

**RBAC Layer** — Role defines base capabilities:

- `jobs:create`, `jobs:read`, `jobs:update`, `jobs:close`
- `candidates:view`, `candidates:edit`, `candidates:submit`
- `shifts:create`, `shifts:assign`, `shifts:cancel`
- `timecards:approve`, `timecards:export`
- `payroll:run`, `payroll:view`, `payroll:export`
- `credentials:verify`, `credentials:override`
- `reports:view`, `reports:export`, `reports:create`
- `settings:tenant`, `settings:users`, `settings:billing`

**ABAC Layer** — Context refines access:

- `tenant_id` — absolute isolation
- `branch_id` — limits to office
- `facility_id` — limits to client site
- `department_id` — limits to unit
- `worker_assignment` — only see your own data
- `data_classification` — PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED
- `employment_relationship` — own workers vs. supplier workers

**Example Policy:**

```
ALLOW recruiter TO candidates:view
  WHERE tenant_id = token.tenant_id
  AND branch_id IN token.branches
  AND candidate.status != 'ARCHIVED'
```

---

## 3. Multi-Tenancy Architecture

### 3.1 Tenant Hierarchy

```
Platform (CareCareer SaaS)
  └── Tenant (Staffing Agency or Health System)
       ├── Legal Entity (for payroll/billing separation)
       │    ├── Brand (public-facing identity)
       │    │    └── Branch / Business Unit
       │    │         └── Team
       │    └── Brand
       ├── Client Group
       │    └── Facility
       │         └── Department → Unit → Cost Center
       ├── Supplier Pool
       └── Worker Population
```

### 3.2 Isolation Strategy

| Layer               | Mechanism                                                 |
| ------------------- | --------------------------------------------------------- |
| Database            | Shared schema, Row-Level Security (RLS) on every table    |
| API                 | `tenant_id` extracted from JWT, injected into every query |
| Storage (S3)        | Prefix: `s3://bucket/{tenant_id}/{module}/{entity_id}/`   |
| Cache (Redis)       | Key prefix: `{tenant_id}:{service}:{key}`                 |
| Events              | Every event envelope carries `tenant_id`                  |
| Search (OpenSearch) | Index per tenant or filtered by tenant field              |
| AI/Agents           | Agent context scoped to tenant, model access controlled   |

### 3.3 Tenant Provisioning (Automated)

When a new tenant signs up:

1. Create tenant record + admin user in identity service
2. Apply entitlement/package (which modules are enabled)
3. Provision Cognito user pool (or app within shared pool)
4. Seed default roles, policies, notification templates
5. Configure feature flags
6. Create S3 namespace
7. Apply RLS policies (automatic — tables already have RLS)
8. Set up billing/metering
9. Send welcome sequence

---

## 4. Database Strategy

### 4.1 Why Not One Database for Everything

Healthcare staffing has wildly different data access patterns:

- **Relational/transactional** — jobs, candidates, timecards, pay calculations
- **High-throughput writes** — clock events, availability signals, notifications
- **Document/unstructured** — resumes, credential images, contracts
- **Search/matching** — candidate search, job matching, faceting
- **Analytics** — reporting, forecasting, historical trends
- **Cache/ephemeral** — sessions, rate limits, real-time projections

### 4.2 Chosen Database Architecture

| Use Case                                                                   | Database                                  | Why                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| **Core business data** (jobs, candidates, placements, timecards, billing)  | Amazon Aurora PostgreSQL                  | ACID, RLS for multi-tenancy, JSON support, proven at scale  |
| **High-throughput events** (clock punches, availability, idempotency keys) | Amazon DynamoDB                           | Sub-ms latency, auto-scaling, TTL for ephemeral data        |
| **Document storage** (resumes, licenses, contracts, images)                | Amazon S3 + Aurora metadata               | Cost-effective, malware scanning, lifecycle policies        |
| **Search & matching** (candidate search, job search, AI vector search)     | Amazon OpenSearch Serverless              | Full-text, faceting, vector/semantic search for AI matching |
| **Cache & real-time** (sessions, rate limits, hot projections)             | Amazon ElastiCache (Redis)                | Sub-ms reads, pub/sub for real-time updates                 |
| **Analytics & reporting**                                                  | Amazon Redshift Serverless + S3 data lake | Governed analytical queries, no impact on OLTP              |
| **Event streaming**                                                        | Amazon EventBridge + SQS                  | Domain event routing, dead-letter handling, replay          |

### 4.3 Core Schema Design (Aurora PostgreSQL)

```sql
-- Every tenant-owned table follows this pattern:
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    -- business fields...
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'APPLICANT',
    -- audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- RLS enforced on every tenant table
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workers
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Application role NEVER bypasses RLS
CREATE ROLE app_service NOINHERIT;
GRANT SELECT, INSERT, UPDATE, DELETE ON workers TO app_service;
-- NO BYPASSRLS
```

### 4.4 Key Entities (Partial ERD)

```
tenants ──┬── branches
          ├── clients ── facilities ── departments
          ├── workers ── credentials
          │             ├── placements
          │             ├── availability
          │             └── documents
          ├── jobs ── applications ── submissions
          ├── shifts ── assignments ── clock_events ── timecards
          ├── pay_rules ── earnings ── payroll_batches
          ├── bill_rules ── invoices ── billing_batches
          ├── suppliers ── supplier_workers
          └── users ── roles ── permissions
```

---

## 5. Platform Modules & Workflows

### 5.1 Module Map (What Bullhorn/Symplr/LaborEdge Do → What We Build)

| Incumbent  | Their Module          | CareCareer Equivalent         | AI Enhancement                                                 |
| ---------- | --------------------- | ----------------------------- | -------------------------------------------------------------- |
| Bullhorn   | ATS / CRM             | **CareCareer Recruit™**      | AI candidate matching, auto-sourcing, engagement scoring       |
| Bullhorn   | Candidate management  | **CareCareer Talent™**       | Predictive attrition, re-engagement agents                     |
| Symplr CTM | Credentialing         | **CareCareer Credential™**   | OCR document extraction, auto-verification, expiry prediction  |
| Symplr     | Compliance tracking   | **CareCareer Compliance™**   | Proactive gap detection, automated remediation workflows       |
| LaborEdge  | Shift scheduling      | **CareCareer Schedule™**     | AI optimizer (coverage, burnout, cost), demand forecasting     |
| LaborEdge  | Time & attendance     | **CareCareer Time™**         | Anomaly detection, geofence validation, auto-exception routing |
| ShiftWise  | VMS                   | **CareCareer VMS™**          | Auto-tiering, intelligent distribution, fill prediction        |
| Sense AI   | Recruiting automation | **CareCareer AI Agents**      | Full agent suite: recruiting, engagement, scheduling, ops      |
| Paycom/ADP | Payroll               | **CareCareer Payroll Prep™** | Exception prediction, auto-correction suggestions              |
| NetSuite   | Billing/ERP           | **CareCareer Billing™**      | Revenue forecasting, margin optimization                       |

---

## 6. Core Workflow Flows

### 6.1 End-to-End Recruiting Flow (ATS-Inspired)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RECRUITING PIPELINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  JOB ORDER          SOURCING           SCREENING         SUBMISSION  │
│  ─────────          ────────           ─────────         ──────────  │
│  Client creates  →  AI Agent scans  →  Recruiter      →  Submit to   │
│  job requirement    job boards,         reviews,          client for  │
│  with specs         internal DB,        phone screen,     approval    │
│                     social media        skills assess                  │
│       │                  │                   │                │       │
│       ▼                  ▼                   ▼                ▼       │
│  ┌─────────┐      ┌───────────┐      ┌──────────┐    ┌──────────┐  │
│  │ DRAFT   │      │ AI MATCH  │      │ QUALIFIED│    │ SUBMITTED│  │
│  │ → OPEN  │      │ & RANK    │      │ → READY  │    │ → CLIENT │  │
│  │ → ACTIVE│      │ → ENGAGE  │      │          │    │   REVIEW │  │
│  └─────────┘      └───────────┘      └──────────┘    └──────────┘  │
│                                                                       │
│  INTERVIEW         OFFER              CREDENTIALING    PLACEMENT     │
│  ─────────         ─────              ─────────────    ─────────     │
│  Client            Extend offer,   →  Verify all    →  Assign to    │
│  interviews,       negotiate rate     licenses,        shifts,       │
│  feedback                             background       start work    │
│       │                  │                   │                │       │
│       ▼                  ▼                   ▼                ▼       │
│  ┌──────────┐     ┌──────────┐      ┌──────────┐    ┌──────────┐   │
│  │INTERVIEW │     │ OFFER    │      │CREDENTIAL│    │ ACTIVE   │   │
│  │ → ACCEPT │     │ → ACCEPT │      │ → VERIFY │    │ WORKER   │   │
│  │ → REJECT │     │ → REJECT │      │ → CLEAR  │    │ ON ASSIGN│   │
│  └──────────┘     └──────────┘      └──────────┘    └──────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**AI Agent Touchpoints in Recruiting:**

- 🤖 Auto-parse job orders → extract requirements, suggest credentials needed
- 🤖 Source candidates from internal DB + external boards simultaneously
- 🤖 Rank/score matches (skills, location, availability, pay expectations)
- 🤖 Draft personalized outreach messages (SMS, email, WhatsApp)
- 🤖 Schedule interviews automatically based on availability
- 🤖 Predict offer acceptance probability
- 🤖 Auto-initiate credentialing workflow on offer acceptance

### 6.2 Credentialing & Compliance Flow

```
CREDENTIAL LIFECYCLE:

  DOCUMENT          EXTRACTION       VERIFICATION      MONITORING
  UPLOAD            (AI-POWERED)     (AUTOMATED)       (CONTINUOUS)
  ────────          ──────────       ────────────      ──────────

  Worker/Agent   →  OCR extracts  →  API call to   →  Daily expiry
  uploads doc       license #,       state board,     check, alert
  (license,         expiry date,     NPDB, OIG,       at 90/60/30
  cert, BLS)        issuing state    exclusions       days out

       │                │                │                │
       ▼                ▼                ▼                ▼
  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │RECEIVED │    │EXTRACTED │    │ VERIFIED │    │ ACTIVE   │
  │         │    │→ REVIEW  │    │ or       │    │→ EXPIRING│
  │         │    │          │    │ REJECTED │    │→ EXPIRED │
  └─────────┘    └──────────┘    └──────────┘    └──────────┘

COMPLIANCE REQUIREMENTS PER FACILITY:
  Facility Config → Required Credentials List
  ├── RN License (state-specific)
  ├── BLS/ACLS Certification
  ├── TB Test (annual)
  ├── Drug Screen (pre-placement + random)
  ├── Background Check (state + federal)
  ├── Physical Exam
  ├── Competency Assessment
  └── Facility-specific orientation

BLOCKING RULES (Deterministic — NEVER AI):
  ✗ Expired license → CANNOT work
  ✗ Failed background → CANNOT place
  ✗ Missing required credential → CANNOT assign to facility
  ✗ OIG/SAM exclusion → IMMEDIATE removal
```

**AI Agent Touchpoints in Credentialing:**

- 🤖 OCR + intelligent document parsing (extract data from photos/scans)
- 🤖 Auto-classify uploaded documents (is this a license or a cert?)
- 🤖 Predict which credentials are about to expire across the population
- 🤖 Draft reminder messages to workers for expiring credentials
- 🤖 Suggest fastest path to credential completion for new hires
- ⛔ AI NEVER determines validity — only suggests, deterministic code decides

---

### 6.3 Scheduling & Shift Management Flow

```
SCHEDULING LIFECYCLE:

  DEMAND              MATCHING           OFFERING          WORKING
  FORECAST            & OPTIMIZE         & CONFIRM         & TRACKING
  ────────            ──────────         ───────────       ──────────

  Census data,     →  AI matches     →  Offer to       →  Worker
  historical          workers to         workers via       clocks in,
  patterns,           open shifts        push/SMS,         geofence
  client request      (skills,           accept/reject     validates
                      proximity,                           location
                      preference)

       │                  │                  │                │
       ▼                  ▼                  ▼                ▼
  ┌─────────┐      ┌──────────┐      ┌──────────┐    ┌──────────┐
  │ OPEN    │      │ OFFERING │      │CONFIRMED │    │IN_PROGRESS│
  │ SHIFTS  │      │ → RANKED │      │→ ASSIGNED│    │→ COMPLETED│
  │         │      │   LIST   │      │          │    │           │
  └─────────┘      └──────────┘      └──────────┘    └──────────┘

POST-SHIFT:
  COMPLETED → TIMECARD_PENDING → TIMECARD_APPROVED →
  PAYROLL_READY → BILLING_READY → CLOSED

EXCEPTIONS:
  CANCELED_BY_CLIENT | CANCELED_BY_WORKER | NO_SHOW |
  UNFILLED | DISPUTED | COMPLIANCE_BLOCKED | REPLACEMENT_REQUIRED
```

**AI Agent Touchpoints in Scheduling:**

- 🤖 Predict demand 2-4 weeks ahead based on census trends
- 🤖 Optimize shift-to-worker matching (multi-factor: skills, distance, cost, preference, burnout)
- 🤖 Smart offer sequencing (offer to most-likely-to-accept first)
- 🤖 Auto-find replacements for cancellations/no-shows
- 🤖 Detect burnout patterns and suggest schedule adjustments
- 🤖 Predict no-show probability and pre-stage backups

### 6.4 Time & Payroll Preparation Flow

```
TIME CAPTURE → VALIDATION → APPROVAL → PAY CALCULATION → EXPORT

  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  CLOCK   │     │ VALIDATE │     │ APPROVE  │     │ CALCULATE│
  │  EVENT   │ ──▶ │ & FLAG   │ ──▶ │ TIMECARD │ ──▶ │ EARNINGS │
  │(mobile/  │     │exceptions│     │(client + │     │(pay rules│
  │ kiosk)   │     │          │     │ internal)│     │ applied) │
  └──────────┘     └──────────┘     └──────────┘     └──────────┘
       │                │                │                │
       ▼                ▼                ▼                ▼
  - Geolocation     - >10% variance   - Client portal  - Overtime (daily/weekly)
  - Timestamp       - Missing punch    approval UI     - Differentials (night/weekend)
  - Device ID       - Outside window  - Auto-approve    - Holiday rules
  - Offline queue   - Geofence fail    if clean        - Guaranteed hours
                                                        - Mileage/stipends

  THEN:
  ┌──────────┐     ┌──────────┐
  │ PAYROLL  │     │  BILLING │
  │  BATCH   │ ──▶ │  BATCH   │
  │(export to│     │(generate │
  │ Paycom/  │     │ invoices │
  │ ADP)     │     │ to client│
  └──────────┘     └──────────┘
```

**AI Agent Touchpoints in Time/Payroll:**

- 🤖 Detect timecard anomalies (unexpected overtime, pattern breaks)
- 🤖 Auto-suggest corrections for common exceptions (missed punch = use schedule)
- 🤖 Predict payroll exceptions before batch runs
- 🤖 Flag potential compliance issues (consecutive shifts, mandatory rest violations)
- ⛔ AI NEVER calculates final pay — deterministic rules engine only

---

### 6.5 Candidate Engagement Flow (Sense AI-Inspired)

```
INTELLIGENT ENGAGEMENT PIPELINE:

  ┌─────────────────────────────────────────────────────────────┐
  │              AI ENGAGEMENT AGENT                              │
  ├─────────────────────────────────────────────────────────────┤
  │                                                               │
  │  CHANNELS:  SMS │ Email │ WhatsApp │ Push │ In-App │ Voice  │
  │                                                               │
  │  TRIGGERS:                                                    │
  │  ├── New job match available                                 │
  │  ├── Credential expiring (30/60/90 days)                     │
  │  ├── Worker idle > X days (re-engagement)                    │
  │  ├── Shift available matching preferences                    │
  │  ├── Onboarding step incomplete                              │
  │  ├── Application submitted (confirmation)                    │
  │  ├── Interview scheduled/reminder                            │
  │  ├── Offer extended                                          │
  │  ├── Timecard due/overdue                                    │
  │  └── Birthday/work anniversary (retention)                   │
  │                                                               │
  │  AI CAPABILITIES:                                             │
  │  ├── Natural language conversation (chat-based apply)        │
  │  ├── Understand intent from free-text responses              │
  │  ├── Schedule meetings/calls based on availability           │
  │  ├── Answer FAQs about pay, benefits, requirements           │
  │  ├── Collect missing information conversationally            │
  │  ├── Personalize messaging tone based on worker profile      │
  │  └── Escalate to human recruiter when confidence is low      │
  │                                                               │
  │  AUTONOMY RULES:                                              │
  │  ├── Tier 0: Read/summarize → AUTOMATIC                     │
  │  ├── Tier 1: Send pre-approved templates → AUTOMATIC         │
  │  ├── Tier 2: Custom messages, schedule shifts → WITH POLICY  │
  │  ├── Tier 3: Offers, rate changes → HUMAN APPROVAL           │
  │  └── Tier 4: Termination, adverse action → NEVER AUTO        │
  │                                                               │
  └─────────────────────────────────────────────────────────────┘
```

---

## 7. AI Agent Architecture

### 7.1 Agent Fleet

| Agent                        | Purpose                                        | Autonomy Tier | Key Tools                                            |
| ---------------------------- | ---------------------------------------------- | ------------- | ---------------------------------------------------- |
| **Recruiting Orchestrator**  | Manage full pipeline for a job order           | Tier 2        | Job boards, internal search, outreach                |
| **Candidate Matcher**        | Score & rank candidates against requirements   | Tier 0-1      | OpenSearch, skills ontology, vector similarity       |
| **Engagement Agent**         | Multi-channel worker communication             | Tier 1-2      | SMS/Email/Push APIs, conversation history            |
| **Credential Assistant**     | Parse docs, track compliance gaps              | Tier 1        | OCR, state board APIs, document store                |
| **Scheduling Optimizer**     | Fill open shifts optimally                     | Tier 2        | Availability DB, matching engine, offer system       |
| **Shift Operations Agent**   | Handle day-of issues (no-shows, cancellations) | Tier 2        | Real-time availability, replacement pool             |
| **Timecard Exception Agent** | Route and suggest resolutions                  | Tier 1        | Time records, pay rules, approval workflows          |
| **Client Service Agent**     | Answer client questions, provide updates       | Tier 0-1      | CRM data, placement records, analytics               |
| **Analytics Agent**          | Natural language reporting & insights          | Tier 0        | Data warehouse, visualization engine                 |
| **Onboarding Coordinator**   | Guide workers through onboarding steps         | Tier 1        | Checklist engine, document store, credential service |

### 7.2 Agent Guardrails (Critical)

```
DETERMINISTIC (Code decides — NEVER AI):
├── Credential validity (expired = blocked, period)
├── Pay rate calculations (overtime, differentials)
├── Bill rate calculations
├── Compliance blocking (OIG, sanctions, failed background)
├── Authorization decisions (can this user do this?)
├── State machine transitions (shift statuses)
├── Tax calculations (if ever built)
└── Adverse action workflow gates

AI ASSISTS (Agent recommends — human/code decides):
├── Candidate ranking (AI suggests, recruiter submits)
├── Shift matching (AI optimizes, coordinator approves)
├── Exception resolution (AI suggests fix, approver decides)
├── Rate recommendations (AI suggests, account manager sets)
└── Engagement messaging (AI drafts, templates pre-approved)
```

### 7.3 Model Routing Strategy

All AI calls go through a central model router — no service calls an LLM directly:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Agent     │ ──▶ │ Model Router │ ──▶ │ Amazon Bedrock   │
│ (Strands SDK)│     │              │     │ (Claude, Titan,  │
└─────────────┘     │ Routes based │     │  Llama, etc.)    │
                    │ on:          │     └─────────────────┘
                    │ - Task risk  │
                    │ - Latency SLO│
                    │ - Cost budget│
                    │ - Data class │
                    │ - Capability │
                    └──────────────┘
```

---

## 8. Integration Architecture

### 8.1 External Systems Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARECAREER PLATFORM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  INBOUND INTEGRATIONS:              OUTBOUND INTEGRATIONS:       │
│                                                                   │
│  Job Boards ─────────┐              ┌──── Payroll Providers      │
│  (Indeed, LinkedIn,  │              │     (Paycom, ADP, Paylocity)│
│   ZipRecruiter)      │              │                             │
│                      │              ├──── ERP / Accounting        │
│  State Boards ───────┤              │     (NetSuite, QuickBooks)  │
│  (License APIs,      │              │                             │
│   Nursys, NPDB)      │     ┌───┐   ├──── Background Check        │
│                      ├────▶│ I │   │     (Sterling, Checkr)      │
│  VMS Platforms ──────┤     │ N │   │                             │
│  (ShiftWise, Medefis,│     │ T │   ├──── Drug Testing            │
│   Fieldglass)        │     │ E │   │     (Quest, LabCorp)        │
│                      │     │ G │   │                             │
│  HRIS Systems ───────┤     │ R │   ├──── Communications          │
│  (Workday, UKG)      │     │ A │   │     (Twilio, SendGrid)     │
│                      │     │ T │   │                             │
│  Identity ───────────┤     │ I │   ├──── Identity Provider       │
│  (SSO, Google,       │     │ O │   │     (Cognito, Auth0)       │
│   Microsoft)         │     │ N │   │                             │
│                      │     │   │   ├──── Cloud Storage            │
│  Time Clocks ────────┤     │ H │   │     (S3, document mgmt)    │
│  (Physical devices,  │     │ U │   │                             │
│   biometric)         │     │ B │   └──── Notifications           │
│                      │     └───┘         (Push, SMS, Email)      │
│  E-Verify ───────────┘                                           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Integration Patterns

| Pattern          | Use Case                                       | Technology             |
| ---------------- | ---------------------------------------------- | ---------------------- |
| **REST API**     | State board verification, job board posting    | OpenAPI 3.1 contracts  |
| **Webhooks**     | VMS job order intake, background check results | Signed payloads, retry |
| **SFTP/File**    | Payroll export to Paycom/ADP, bulk data loads  | Encrypted, scheduled   |
| **Event-driven** | Internal service communication                 | EventBridge + SQS      |
| **Real-time**    | Time clock events, mobile clock                | WebSocket / MQTT       |
| **Batch sync**   | Analytics warehouse load, compliance reporting | Step Functions + S3    |

---

## 9. Technical Architecture

### 9.1 High-Level System Diagram

```
                        ┌──────────────────────────┐
                        │      CDN (CloudFront)     │
                        └────────────┬─────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
     ┌────────▼────────┐   ┌───────▼───────┐   ┌────────▼────────┐
     │  Admin Portal   │   │ Client Portal │   │  Mobile App     │
     │  (Next.js)      │   │ (Next.js)     │   │  (React Native) │
     └────────┬────────┘   └───────┬───────┘   └────────┬────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │    API Gateway (Kong)     │
                        │    + WAF + Rate Limiting  │
                        └────────────┬─────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │    Amazon EKS Cluster     │
                        │                           │
                        │  ┌─────────────────────┐  │
                        │  │   Domain Services   │  │
                        │  ├─────────────────────┤  │
                        │  │ • recruit-service   │  │
                        │  │ • worker-service    │  │
                        │  │ • credential-svc    │  │
                        │  │ • schedule-service  │  │
                        │  │ • time-service      │  │
                        │  │ • payroll-prep-svc  │  │
                        │  │ • billing-service   │  │
                        │  │ • client-service    │  │
                        │  │ • notification-svc  │  │
                        │  │ • identity-service  │  │
                        │  │ • tenant-service    │  │
                        │  │ • ai-platform-svc   │  │
                        │  └─────────────────────┘  │
                        │                           │
                        │  ┌─────────────────────┐  │
                        │  │   AI Agent Runtime  │  │
                        │  │   (Bedrock AgentCore)│  │
                        │  └─────────────────────┘  │
                        └───────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
     ┌────────▼────────┐   ┌───────▼───────┐   ┌────────▼────────┐
     │ Aurora PostgreSQL│   │   DynamoDB    │   │  OpenSearch     │
     │ (Primary OLTP)  │   │ (Events/Clock)│   │  (Search/Match) │
     └─────────────────┘   └───────────────┘   └─────────────────┘
              │
     ┌────────▼────────┐   ┌───────────────┐   ┌─────────────────┐
     │ ElastiCache     │   │      S3       │   │   EventBridge   │
     │ (Redis)         │   │  (Documents)  │   │   + SQS         │
     └─────────────────┘   └───────────────┘   └─────────────────┘
```

### 9.2 Technology Stack Summary

| Layer                 | Technology                               | Rationale                                              |
| --------------------- | ---------------------------------------- | ------------------------------------------------------ |
| **Frontend Web**      | Next.js 14 + React 18 + TypeScript       | SSR for SEO, RSC for performance, shared design system |
| **Mobile**            | React Native + Expo                      | Cross-platform, offline-first for clock                |
| **API Gateway**       | Kong on EKS (or AWS API Gateway)         | Rate limiting, auth, routing, observability            |
| **Backend Services**  | TypeScript (Node.js)                     | Primary language for new services                      |
| **Retained Services** | Go                                       | Existing Maestra services that meet standards          |
| **AI Agents**         | Python (Strands SDK) + Bedrock AgentCore | Best AI ecosystem, agent evaluation tooling            |
| **Database**          | Aurora PostgreSQL + DynamoDB             | See Section 4                                          |
| **Search**            | OpenSearch Serverless                    | Full-text + vector for AI matching                     |
| **Cache**             | ElastiCache Redis                        | Sessions, hot data, rate limiting                      |
| **Storage**           | S3                                       | Documents, analytics data lake                         |
| **Events**            | EventBridge + SQS                        | Async domain events, DLQ, replay                       |
| **Workflows**         | AWS Step Functions                       | Long-running processes, approvals                      |
| **Auth**              | Amazon Cognito + custom RBAC/ABAC        | External users + fine-grained authorization            |
| **IaC**               | Terraform + Helm                         | All infrastructure as code                             |
| **CI/CD**             | GitHub Actions → ECR → EKS               | Automated deploy pipeline                              |
| **Observability**     | OpenTelemetry + CloudWatch + Grafana     | Traces, metrics, logs, dashboards                      |
| **Monorepo**          | Turborepo + pnpm                         | Shared packages, selective builds                      |

---

## 10. Security, Compliance & Data Classification

### 10.1 Compliance Requirements

| Regulation           | Scope                   | Key Controls                                 |
| -------------------- | ----------------------- | -------------------------------------------- |
| **HIPAA**            | Any PHI processed       | Encryption, access controls, audit, BAA      |
| **SOC 2 Type II**    | Entire platform         | Security, availability, confidentiality      |
| **FCRA**             | Background checks       | Adverse action workflow, consent, disclosure |
| **State Privacy**    | Worker/candidate PII    | Retention limits, right to delete, consent   |
| **Joint Commission** | Credential verification | Primary source verification, audit trail     |

### 10.2 Data Classification

```
RESTRICTED:  SSN, DOB, financial accounts, PHI, background check results,
             drug test results, passwords, API keys
             → Encrypted at field level, strict access, audit every read

CONFIDENTIAL: Pay rates, bill rates, contract terms, performance scores,
              disciplinary records, internal communications
              → Encrypted at rest, role-based access, audit on write

INTERNAL:    Job orders, shift details, candidate profiles (non-PII),
             facility information, operational metrics
             → Standard encryption, broad internal access

PUBLIC:      Published job postings, company information, general
             platform documentation
             → No special controls
```

### 10.3 Security Architecture

- **Authentication:** Cognito (MFA required for admin/recruiter), phishing-resistant for privileged
- **Authorization:** Custom RBAC+ABAC engine, checked at every API boundary
- **Encryption:** TLS 1.3 in transit, AES-256 at rest, KMS-managed keys
- **Network:** Private subnets for data stores, VPC endpoints, WAF on public
- **Secrets:** AWS Secrets Manager, rotated automatically, never in code
- **Scanning:** SAST, SCA, container scanning, DAST, SBOM generation
- **Audit:** Immutable audit log (S3 + DynamoDB), 7-year retention
- **Penetration Testing:** Quarterly by certified third-party

---

## 11. Recommended Build Sequence

### Phase 0: Foundation (Weeks 1-4)

- Monorepo scaffold (Turborepo, packages, shared configs)
- Terraform: VPC, EKS cluster, Aurora, Redis, S3
- tenant-service + identity-service (multi-tenancy + auth)
- CI/CD pipeline (GitHub Actions → ECR → EKS)
- Design system foundation (component library)
- Domain kernel package (state machines, events, RLS helpers)

### Phase 1: Recruiting + Credentialing (Weeks 5-12)

- recruit-service (job orders, candidates, applications, submissions)
- credential-service (upload, OCR extraction, state board verification)
- worker-service (profiles, availability, preferences)
- Candidate portal (apply, onboarding, document upload)
- Admin portal (recruiter workspace, pipeline views)
- First AI agent: Candidate Matcher (Tier 0, read-only scoring)

### Phase 2: Scheduling + Time (Weeks 13-20)

- schedule-service (shifts, offers, assignments, cancellations)
- time-service (clock events, timecards, approvals)
- Client portal (shift requests, timecard approval)
- Mobile app (clock in/out, offline support, geofence)
- AI agent: Scheduling Optimizer (Tier 2, with policy gates)
- AI agent: Engagement Agent (Tier 1, template-based outreach)

### Phase 3: Pay + Bill + Operations (Weeks 21-28)

- payroll-prep-service (earnings calc, batch export to Paycom/ADP)
- billing-service (invoice generation, ERP export)
- VMS inbound integration (accept job orders from client VMS)
- Analytics dashboards (executive, recruiter, ops)
- AI agent: Timecard Exception Assistant
- AI agent: Shift Operations (replacement finding)

### Phase 4: Scale + Optimize (Weeks 29-36)

- MSP/VMS supplier management
- Advanced AI agents (full recruiting orchestrator)
- Performance optimization and load testing
- SOC 2 preparation
- Multi-language support
- Enterprise features (custom workflows, advanced RBAC)

---

## 12. What Makes This Better Than Bullhorn + Symplr + LaborEdge

| Dimension         | Incumbents                                 | CareCareer                                     |
| ----------------- | ------------------------------------------ | ---------------------------------------------- |
| **Architecture**  | Monolithic, bolted-on acquisitions         | Microservices, event-driven, built as one      |
| **Multi-tenancy** | Per-customer deployments or weak isolation | RLS-enforced from day one, 1000+ tenants       |
| **AI**            | Bolted-on chatbots, basic matching         | Native agent fleet in every workflow           |
| **Mobile**        | Browser-only or weak apps                  | Offline-first React Native with clock          |
| **Integration**   | Point-to-point, brittle                    | Event-driven, standardized contracts           |
| **Compliance**    | Manual tracking, spreadsheets              | Automated verification + continuous monitoring |
| **UX**            | 2005-era interfaces                        | Modern design system, responsive, accessible   |
| **Data**          | Siloed across systems                      | Single source of truth, unified analytics      |
| **Customization** | Code forks per customer                    | Configuration, policy, feature flags           |
| **Speed**         | Weeks to onboard                           | Same-day tenant provisioning                   |

---

## 13. Key Decision Points Needed

Before coding starts, these decisions need sign-off:

1. **Payroll scope:** Prep-only (export to Paycom/ADP) or full payroll engine?
   → Recommendation: Prep-only for v1, full payroll is a separate product
2. **EOR scope:** Is international employer-of-record in v1?
   → Recommendation: No, defer to Phase 4+

3. **VMS direction:** Build our own VMS or integrate with existing (ShiftWise, Medefis)?
   → Recommendation: Integrate inbound first, build own in Phase 3-4

4. **Migration from Maestra:** What data and workflows must migrate on day one?
   → Need inventory of what's running in production today

5. **Initial tenant count:** Are we building for 3 pilot facilities or 50 clients?
   → Affects infrastructure sizing and provisioning automation priority

6. **Team size and budget:** How many engineers, what timeline?
   → Minimum viable: 10-12 for first 6 months

---

_Document generated from analysis of CARECAREER_MASTER_PACKAGE.md and SRS v3.0_
_Ready for review and implementation planning_
