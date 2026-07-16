# CareCareer — Strategy, Competitive Research & Core Flows

## What We're Replacing (The 4 Tools Research)

---

### 🔵 BULLHORN — The ATS/CRM King

**What they do:** End-to-end staffing platform (ATS + CRM + Middle Office + Back Office)

**Their Core Modules:**
1. **Front Office (ATS + CRM)**
   - Candidate database with resume parsing
   - Job order management (from clients)
   - Sales pipeline (leads → clients)
   - Submission workflow (candidate → client review)
   - Email/calendar integration (Gmail, Outlook)
   - AI search and match
   - Reporting and dashboards

2. **Middle Office**
   - Time & expense capture
   - Compliance tracking
   - Pay/bill rate management
   - Rules engine (auto-calculate OT, differentials)

3. **Back Office**
   - Payroll processing
   - Invoicing / billing
   - Commissions calculation
   - Onboarding (digital forms, e-sign)
   - GL/ERP integration

**Key Flows We're Taking:**
- Job Order → Source → Screen → Submit → Interview → Place
- Candidate lifecycle tracking (lead → active → alumni)
- Client relationship management + sales pipeline
- Placement-to-pay pipeline

---

### 🟢 SYMPLR — The Credentialing & Compliance Authority

**What they do:** Healthcare operations platform focused on provider/worker credentialing

**Their Core Modules:**
1. **Credentialing (CTM - Contingent Talent Management)**
   - Credential tracking per worker (licenses, certs, skills)
   - Primary source verification (direct from state boards)
   - Automated expiration monitoring and alerts
   - Facility-specific requirement matrices
   - Document management (upload, store, retrieve)
   - Compliance dashboards (who's expiring, who's non-compliant)

2. **Provider Data Management**
   - Single source of truth for all provider/worker data
   - Automated data validation against primary sources
   - Privileging workflows (can this person work at this facility?)

3. **Workforce Management**
   - Scheduling and shift management
   - On-call scheduling
   - Clinical collaboration / secure messaging
   - Time and attendance

4. **Vendor Management**
   - Vendor credentialing (ensure agency workers are compliant)
   - Visitor management and access control

**Key Flows We're Taking:**
- Credential requirement setup per facility/department
- Upload → OCR/Extract → Verify against state board → Approve/Reject
- Continuous monitoring (expiry alerts at 90/60/30 days)
- Compliance blocking (expired credential = can't work, period)
- Facility-worker eligibility matrix (does worker X meet facility Y's requirements?)

---

### 🟠 LABOREDGE (Nexus Platform) — Healthcare-Specific ATS + VMS

**What they do:** Healthcare staffing technology connecting hospitals, agencies, and talent

**Their Product Suite:**
1. **NexusATS (Agencies)**
   - Healthcare-specific applicant tracking
   - Compliance management (built-in, not bolted on)
   - Per-diem / PRN, Travel, Local, and Permanent staffing segments
   - Candidate portal (self-service profile, availability, scheduling)
   - Client portal (post needs, review candidates, approve timesheets)
   - Mobile app (shift search, schedule view, virtual timesheets)
   - Apply → Respond → Accept workflow (fast shift filling)

2. **NexusVMS (Hospitals)**
   - Vendor management for facilities
   - Order distribution to staffing agencies
   - Rate management and spend analytics
   - BI analytics and reporting
   - Cost reduction (cut agency fees 25%+)

3. **NexusMobile**
   - White-label mobile app for agencies
   - Shift searches and scheduling
   - Virtual timesheet submission
   - Credential upload on the go
   - Push notifications for time-sensitive actions

4. **NexusH (Hospitals Direct)**
   - Internal float pool management
   - Direct-hire without agency middlemen
   - Cost tracking and reduction

**Key Flows We're Taking:**
- Per-diem shift marketplace (Apply/Respond/Accept pattern)
- Candidate self-service (profile, availability, schedule, timesheets)
- Client portal (order posting, candidate review, timecard approval)
- VMS order distribution to multiple agencies
- Mobile-first worker experience
- Healthcare compliance built into every workflow step

---

### 🟣 SENSE AI — The Intelligent Engagement Layer

**What they do:** AI-powered recruiting automation that layers on top of an ATS

**Their Core Capabilities:**
1. **AI Chatbot (Grace)**
   - Natural language conversations with candidates
   - Pre-screening via chat (asks qualifying questions)
   - 72% of candidates think they're talking to a human
   - 24/7 availability (answers FAQs about company, benefits, role)
   - Qualified candidates can self-schedule interviews
   - Live chat handoff to recruiter when needed

2. **Workflows (Automation Engine)**
   - Multi-step automated sequences (SMS, email, WhatsApp)
   - Trigger-based (application received, credential expiring, idle worker)
   - AI job matching (match candidates to jobs 24/7)
   - Claimed 50% increase in recruiter productivity

3. **Pre-Screen**
   - Automated qualification assessment
   - Generates shortlist of qualified candidates
   - Increases hiring speed by up to 55%

4. **AI Video Interviewer**
   - Conversational AI video interviews for screening
   - Async (candidate records on their schedule)
   - AI evaluates responses

5. **Conversational Voice AI**
   - Automated voice calls for pre-screening
   - Collects and evaluates candidate details
   - Schedules interviews for qualified candidates

6. **Journeys (Candidate Experience)**
   - Personalized candidate journeys (onboarding, redeployment)
   - Multi-channel touchpoints
   - Engagement scoring

7. **Discover (Talent Rediscovery)**
   - AI searches existing database for past candidates
   - Re-engages dormant talent
   - Matches historical candidates to new openings

**Key Flows We're Taking:**
- AI chatbot for 24/7 candidate engagement and screening
- Automated multi-channel outreach sequences
- AI-powered candidate matching and scoring
- Conversational interview scheduling
- Talent rediscovery (mine your own database)
- Worker re-engagement campaigns
- Engagement scoring (who's likely to respond/accept)

---

## How CareCareer Combines All Four

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CARECAREER PLATFORM                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  FROM BULLHORN:        FROM SYMPLR:         FROM LABOREDGE:          │
│  ─────────────         ──────────           ────────────             │
│  • ATS/CRM core       • Credentialing      • Healthcare-specific    │
│  • Sales pipeline      • PSV verification   • Per-diem marketplace  │
│  • Job orders          • Compliance matrix  • Apply/Respond/Accept  │
│  • Submissions         • Expiry monitoring  • Candidate self-serve  │
│  • Middle office       • Facility rules     • Client portal         │
│  • Pay/bill engine     • Document mgmt      • VMS distribution      │
│  • Onboarding          • Blocking rules     • Mobile-first          │
│                                                                       │
│                    FROM SENSE AI:                                     │
│                    ─────────────                                      │
│                    • AI chatbot (pre-screen, FAQ, scheduling)        │
│                    • Automated engagement sequences                   │
│                    • AI candidate matching & scoring                  │
│                    • Talent rediscovery                               │
│                    • Voice AI screening                               │
│                    • Engagement scoring                               │
│                    • Conversational apply                             │
│                                                                       │
│  WHAT WE ADD THAT NONE OF THEM HAVE:                                 │
│  ────────────────────────────────────                                │
│  • True multi-tenancy (1000+ agencies on one platform)              │
│  • AI agents embedded in EVERY workflow (not a bolt-on)             │
│  • Unified data model (no integration hell)                          │
│  • Modern UX (not 2005 interfaces)                                   │
│  • Event-driven architecture (real-time everything)                  │
│  • Deterministic rules engine (compliant pay/bill/credential)       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## THE 6 MAJOR FLOWS (What We Build First)

These are the revenue-critical workflows. Everything else is secondary.

---

### FLOW 1: Job Order → Placement (The Revenue Engine)

```
WHO: Client (posts need) → Recruiter (fills it) → Candidate (gets placed)

TRIGGER: Client needs a nurse for ICU, night shift, starting next Monday

┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: JOB ORDER CREATION                                        │
│ Actor: Hiring Manager (Client Portal) or Account Manager         │
│                                                                    │
│ • Select facility, department, unit                               │
│ • Choose role (RN, LPN, CNA, etc.)                               │
│ • Set shift type, dates, pay range                                │
│ • System auto-populates credential requirements from facility     │
│ • 🤖 AI: Suggests pay rate based on market data + fill history   │
│                                                                    │
│ OUTPUT: Job Order in status OPEN                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: CANDIDATE SOURCING & MATCHING                             │
│ Actor: Recruiter + AI Matching Agent                             │
│                                                                    │
│ • 🤖 AI: Instantly searches internal database for matches        │
│ • 🤖 AI: Ranks candidates (skills, proximity, availability,     │
│         credential status, past performance, pay expectations)    │
│ • 🤖 AI: Identifies "ready now" vs "needs credentialing"        │
│ • Recruiter reviews AI-ranked list                                │
│ • 🤖 AI: Posts to external job boards if internal pool thin      │
│ • 🤖 AI: Sends personalized outreach to top matches             │
│                                                                    │
│ OUTPUT: Shortlist of interested, qualified candidates             │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: SCREENING & QUALIFICATION                                 │
│ Actor: Recruiter + AI Pre-Screen Bot                             │
│                                                                    │
│ • 🤖 AI Chatbot: Conducts initial screening conversation        │
│   - Confirms availability for the dates                          │
│   - Verifies credential status                                    │
│   - Confirms acceptable pay rate                                  │
│   - Checks distance/commute willingness                          │
│ • Recruiter does phone/video screen for top candidates           │
│ • System checks compliance status (all credentials current?)     │
│ • ⛔ GATE: Missing required credential = cannot proceed          │
│                                                                    │
│ OUTPUT: Qualified candidates ready for submission                 │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: SUBMISSION TO CLIENT                                      │
│ Actor: Recruiter → Client (Hiring Manager)                       │
│                                                                    │
│ • Recruiter submits 2-3 candidates via platform                  │
│ • Client receives notification (email + portal)                  │
│ • Client reviews profiles, credentials, availability             │
│ • Client accepts, rejects, or requests interview                 │
│ • 🤖 AI: If interview requested, auto-schedule based on         │
│         availability of both parties                              │
│                                                                    │
│ OUTPUT: Client selects preferred candidate                        │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: OFFER & CONFIRMATION                                      │
│ Actor: Recruiter → Candidate                                     │
│                                                                    │
│ • Recruiter extends offer (rate, schedule, start date)           │
│ • Candidate accepts/negotiates via app or chat                   │
│ • System creates PLACEMENT record                                 │
│ • System triggers: credential re-verification if >30 days old   │
│ • System triggers: onboarding checklist if new to facility       │
│ • 🤖 AI: Sends confirmation + prep info to candidate            │
│                                                                    │
│ OUTPUT: Confirmed placement, shift(s) created                    │
└──────────────────────────────────────────────────────────────────┘
```

---

### FLOW 2: Per-Diem Shift Marketplace (LaborEdge-Inspired)

```
WHO: Facility (posts shifts) → Worker (picks up shifts)
THIS IS THE HIGH-VOLUME, HIGH-SPEED FLOW

┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: SHIFT CREATION                                            │
│ Actor: Scheduling Coordinator or Nurse Manager                   │
│                                                                    │
│ • Create shift(s): facility, unit, role, date, time, rate       │
│ • Batch creation (e.g., "need 3 RNs for ICU, Mon-Fri 7p-7a")  │
│ • System auto-attaches credential requirements                   │
│ • 🤖 AI: Predicts fill difficulty, suggests rate adjustment     │
│                                                                    │
│ OUTPUT: Shifts in status OPEN on marketplace                     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: MATCHING & NOTIFICATION                                   │
│ Actor: System + AI Agent                                         │
│                                                                    │
│ • 🤖 AI: Match shifts to eligible workers in real-time          │
│   - Has required credentials? (MUST)                             │
│   - Available on that date? (MUST)                               │
│   - Within commute distance? (scored)                            │
│   - Has worked this facility before? (scored)                    │
│   - Performance history? (scored)                                │
│   - Burnout risk? (scored — not too many consecutive shifts)     │
│ • Push notification to matched workers: "New shift available!"  │
│ • 🤖 AI: Sequences notifications (best matches first)          │
│                                                                    │
│ OUTPUT: Workers see available shifts in their app                 │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: APPLY / RESPOND / ACCEPT                                  │
│ Actor: Worker (via Mobile App)                                   │
│                                                                    │
│ • Worker browses available shifts (filtered by preferences)      │
│ • Worker taps "I'm interested" or "Apply"                       │
│ • System instant-checks:                                         │
│   ⛔ Credential current? → Block if expired                     │
│   ⛔ Already scheduled that time? → Conflict warning            │
│   ⛔ Overtime threshold? → Flag for approval                    │
│   ✅ All clear → Auto-confirm OR route to coordinator           │
│                                                                    │
│ Two models:                                                       │
│ A) AUTO-CONFIRM: Worker applies → instant confirmation          │
│ B) COORDINATOR REVIEW: Worker applies → coordinator approves    │
│                                                                    │
│ OUTPUT: Shift status → CONFIRMED, worker assigned                │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: DAY-OF OPERATIONS                                         │
│ Actor: Worker + System                                           │
│                                                                    │
│ • Reminder notification 12h and 2h before shift                  │
│ • Worker clocks in via mobile (geofence validated)               │
│ • If NO-SHOW detected (15 min past start, no clock):            │
│   🤖 AI: Auto-ping worker → escalate to coordinator → trigger  │
│         replacement finding workflow                              │
│ • Worker clocks out at shift end                                  │
│ • System calculates hours worked                                  │
│                                                                    │
│ OUTPUT: Shift COMPLETED, timecard auto-generated                 │
└──────────────────────────────────────────────────────────────────┘
```

---

### FLOW 3: Credentialing & Compliance (Symplr-Inspired)

```
WHO: Worker (uploads docs) → Credential Specialist (verifies) → System (enforces)

┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: REQUIREMENT DEFINITION (Admin Setup)                      │
│ Actor: Tenant Admin / Compliance Officer                         │
│                                                                    │
│ • Define credential types (RN License, BLS, TB Test, etc.)       │
│ • Set requirements per:                                           │
│   - Role (RN needs X, CNA needs Y)                               │
│   - Facility (Hospital A requires drug screen, Clinic B doesn't)│
│   - Department (ICU needs ACLS, Med-Surg doesn't)               │
│   - State (state-specific license requirements)                  │
│ • Set renewal rules (annual TB, biennial license, etc.)          │
│ • Set alert thresholds (alert at 90, 60, 30, 14, 7 days)       │
│                                                                    │
│ OUTPUT: Compliance matrix (role × facility × credential)         │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: DOCUMENT COLLECTION                                       │
│ Actor: Worker (Mobile/Portal) + AI Agent                         │
│                                                                    │
│ • Worker uploads photo/scan of credential document               │
│ • 🤖 AI: OCR extracts:                                          │
│   - License number                                                │
│   - Issuing state/authority                                       │
│   - Expiration date                                               │
│   - Worker name (cross-reference)                                │
│   - Document type classification                                  │
│ • 🤖 AI: Auto-fills form fields from extracted data             │
│ • Worker confirms/corrects extracted information                  │
│                                                                    │
│ OUTPUT: Credential record created, status = RECEIVED             │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: VERIFICATION (Primary Source)                             │
│ Actor: System (automated) + Credential Specialist (manual)       │
│                                                                    │
│ AUTOMATED PATH:                                                   │
│ • System calls state board API (e.g., Nursys for nursing)       │
│ • Checks: Active? Disciplinary actions? Expiration date?        │
│ • Cross-references OIG exclusion list                            │
│ • Cross-references SAM.gov (debarment)                           │
│ • If all clear → status = VERIFIED                               │
│                                                                    │
│ MANUAL PATH (if API unavailable or discrepancy):                 │
│ • Route to Credential Specialist queue                           │
│ • Specialist performs manual primary source verification         │
│ • Specialist approves or rejects with reason                     │
│                                                                    │
│ ⛔ DETERMINISTIC RULE: Verification logic is CODE, not AI        │
│                                                                    │
│ OUTPUT: Credential status = VERIFIED or REJECTED                 │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: CONTINUOUS MONITORING                                     │
│ Actor: System (automated) + AI Agent (engagement)                │
│                                                                    │
│ • Daily job: check all credentials against expiry dates          │
│ • 90 days out: 🤖 AI sends friendly reminder to worker          │
│ • 60 days out: Escalate, include renewal instructions            │
│ • 30 days out: Alert recruiter/coordinator too                   │
│ • 14 days out: WARNING — upcoming compliance gap                 │
│ • Expired: ⛔ BLOCK — remove from available pool, cancel shifts │
│                                                                    │
│ • Periodic re-verification against state boards                  │
│ • Immediate action on sanctions/exclusions (OIG/SAM alert)      │
│                                                                    │
│ OUTPUT: Always-current compliance status per worker              │
└──────────────────────────────────────────────────────────────────┘
```

---

### FLOW 4: Time → Pay → Bill (The Money Flow)

```
WHO: Worker (clocks hours) → Client (approves) → Agency (pays worker, bills client)

┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: TIME CAPTURE                                              │
│ Actor: Worker (Mobile App)                                       │
│                                                                    │
│ • Worker opens app → "Clock In" button                           │
│ • System captures: timestamp, GPS coordinates, device ID         │
│ • ⛔ Geofence check: Are you at the facility? (within 200m)     │
│ • Offline support: If no signal, store locally, sync later       │
│ • Break tracking: Clock out/in for breaks                        │
│ • Clock out at shift end                                          │
│                                                                    │
│ ALTERNATIVE: Worker submits timesheet manually (hours per shift) │
│                                                                    │
│ OUTPUT: Raw clock events stored (DynamoDB for speed)             │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: TIMECARD GENERATION & VALIDATION                          │
│ Actor: System (automated)                                        │
│                                                                    │
│ • System generates timecard from clock events                    │
│ • Validation rules (deterministic):                              │
│   - Hours match scheduled shift? (within tolerance)              │
│   - Break rules met? (state-specific meal/rest requirements)     │
│   - Overtime threshold crossed? (daily/weekly)                   │
│   - Geofence validated at clock in and out?                      │
│ • 🤖 AI: Flags anomalies (patterns, unusual hours)             │
│ • If clean → auto-route to approval                              │
│ • If exceptions → route to exception queue                       │
│                                                                    │
│ OUTPUT: Timecard status = PENDING_APPROVAL or EXCEPTION          │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: APPROVAL (Dual)                                           │
│ Actor: Client (Timecard Approver) + Internal (Payroll Admin)     │
│                                                                    │
│ CLIENT APPROVAL:                                                  │
│ • Client sees timecards in their portal                          │
│ • Reviews hours, can dispute/correct                              │
│ • Approves individually or bulk-approve "clean" timecards       │
│                                                                    │
│ INTERNAL APPROVAL (for exceptions):                               │
│ • Payroll admin reviews flagged exceptions                       │
│ • 🤖 AI: Suggests resolution (e.g., "missed punch, use         │
│         scheduled end time based on pattern")                     │
│ • Admin approves correction or escalates                         │
│                                                                    │
│ OUTPUT: Timecard status = APPROVED                               │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: PAY CALCULATION (Deterministic Engine)                    │
│ Actor: System (rules engine — NO AI)                             │
│                                                                    │
│ • Apply pay rules (per worker, per client, per role):            │
│   - Base hourly rate                                              │
│   - Overtime (1.5x after 40h/week or 8h/day per state)          │
│   - Night differential (+$3/hr for 7p-7a)                       │
│   - Weekend differential (+$5/hr Sat/Sun)                        │
│   - Holiday premium (2x on designated holidays)                  │
│   - Guaranteed hours (if contracted for 36h, pay min 36h)       │
│   - Travel stipends, per diem, housing                           │
│   - Mileage reimbursement                                         │
│ • ⛔ ALL CALCULATIONS ARE DETERMINISTIC CODE                     │
│ • Generate earnings breakdown per worker                         │
│                                                                    │
│ OUTPUT: Payroll batch ready for export                            │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: BILL CALCULATION + EXPORT                                 │
│ Actor: System + Billing Specialist                               │
│                                                                    │
│ PAY SIDE:                                                         │
│ • Export payroll batch to payroll provider (Paycom, ADP)         │
│ • Reconcile: provider confirms processing                        │
│                                                                    │
│ BILL SIDE:                                                        │
│ • Apply bill rules (markup on pay rate, flat fees, etc.)        │
│ • Generate invoice per client, per period                        │
│ • Include supporting detail (shifts, hours, rates)               │
│ • Export to ERP/accounting (NetSuite, QuickBooks)                │
│ • Track payment status (sent → paid → overdue)                  │
│                                                                    │
│ OUTPUT: Workers paid, clients invoiced                            │
└──────────────────────────────────────────────────────────────────┘
```

---

### FLOW 5: AI Engagement & Re-Engagement (Sense AI-Inspired)

```
WHO: AI Agent → Workers (candidates, active, inactive, alumni)

THIS RUNS CONTINUOUSLY IN THE BACKGROUND

┌──────────────────────────────────────────────────────────────────┐
│ TRIGGER ENGINE (When does AI engage?)                              │
│                                                                    │
│ NEW CANDIDATE:                                                    │
│ • Applies to job → Instant acknowledgment + pre-screen chat     │
│ • Completes application → Next steps guidance                    │
│ • Idle 48h during onboarding → "Need help?" nudge               │
│                                                                    │
│ ACTIVE WORKER:                                                    │
│ • Shift confirmed → Prep info + reminder                        │
│ • Credential expiring → Renewal reminder with instructions      │
│ • No shifts picked up in 2 weeks → "We have shifts for you"    │
│ • Paycheck processed → Notification                              │
│ • Birthday/anniversary → Personal touch                          │
│                                                                    │
│ INACTIVE WORKER:                                                  │
│ • Idle >30 days → Re-engagement campaign                        │
│ • New job matching profile → "Perfect match found!"             │
│ • Rate increase available → Incentive message                   │
│                                                                    │
│ CLIENT-FACING:                                                    │
│ • Shift unfilled 48h → Proactive update with options            │
│ • Timecard pending approval → Reminder                           │
│ • Invoice generated → Notification                               │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ AI CONVERSATION ENGINE                                            │
│                                                                    │
│ CHANNELS: SMS | Email | WhatsApp | Push | In-App | Voice         │
│                                                                    │
│ CAPABILITIES:                                                     │
│ • Understand free-text responses ("yeah im available tuesday")  │
│ • Answer FAQs about pay, benefits, facility, requirements       │
│ • Collect missing information conversationally                   │
│ • Schedule interviews/orientations                                │
│ • Confirm or decline shift offers                                 │
│ • Escalate to human when:                                        │
│   - Confidence < threshold                                        │
│   - Candidate asks for supervisor                                │
│   - Complaint or dispute detected                                │
│   - High-risk decision needed                                     │
│                                                                    │
│ PERSONALIZATION:                                                  │
│ • Tone matching (casual for per-diem, formal for travel)        │
│ • Channel preference (some prefer SMS, others email)             │
│ • Time-of-day optimization (don't text at 2am)                  │
│ • Language (English, Spanish initially)                           │
└──────────────────────────────────────────────────────────────────┘
```

---

### FLOW 6: VMS/MSP Order Distribution

```
WHO: Hospital (needs staff) → VMS → Agencies (fill the order)

┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: FACILITY POSTS NEED                                       │
│ Actor: Hospital HR / Nurse Manager                               │
│                                                                    │
│ • Facility creates order in VMS (or CareCareer direct)          │
│ • Specifies: role, unit, dates, shift, rate cap, requirements   │
│ • Order enters distribution queue                                 │
│                                                                    │
│ OUTPUT: Order ready for distribution                              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: INTELLIGENT DISTRIBUTION                                  │
│ Actor: System + AI                                               │
│                                                                    │
│ • 🤖 AI: Determine distribution strategy:                       │
│   - Tier 1 agencies (best performers) get first access          │
│   - Time-based release (Tier 1 has 4h exclusive, then Tier 2)  │
│   - Direct match if internal pool can fill                       │
│ • Distribute to qualified agencies based on:                     │
│   - Performance score (fill rate, quality, speed)                │
│   - Specialty match                                               │
│   - Geographic coverage                                           │
│   - Rate competitiveness                                          │
│                                                                    │
│ OUTPUT: Agencies notified of available orders                    │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: AGENCY SUBMISSION                                         │
│ Actor: Supplier Recruiter                                        │
│                                                                    │
│ • Agency reviews order details                                    │
│ • Submits candidate(s) with:                                     │
│   - Profile / resume                                              │
│   - Credential status (must be fully compliant)                  │
│   - Proposed rate                                                 │
│   - Availability confirmation                                    │
│ • ⛔ System validates: candidate meets all requirements          │
│                                                                    │
│ OUTPUT: Submissions for facility review                          │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: FACILITY SELECTS & CONFIRMS                               │
│ Actor: Hiring Manager / Nurse Manager                            │
│                                                                    │
│ • Review submissions from multiple agencies                      │
│ • Accept/reject candidates                                        │
│ • Confirm assignment                                              │
│ • System creates shift assignment                                 │
│ • Feeds into standard Time → Pay → Bill flow                    │
│                                                                    │
│ OUTPUT: Worker assigned, agencies scored on outcome              │
└──────────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTATION STRATEGY — Where to Start

### The Problem: This is 18+ months of work. What do we build FIRST?

### The Answer: Build the SMALLEST thing that generates revenue.

```
REVENUE = Worker works a shift + Gets paid + Client gets billed

Therefore MVP = enough system to:
1. Get a worker into the system (Recruit)
2. Verify they can work (Credential)
3. Assign them to a shift (Schedule)
4. Track their hours (Time)
5. Pay them and bill the client (Pay/Bill)
```

---

### SPRINT PLAN — First 12 Weeks

```
WEEKS 1-2: FOUNDATION
━━━━━━━━━━━━━━━━━━━━━
├── Monorepo setup (Turborepo + pnpm + TypeScript)
├── Terraform: VPC, EKS, Aurora PostgreSQL, Redis, S3
├── tenant-service (create tenant, configure, isolate)
├── identity-service (Cognito, JWT, RBAC middleware)
├── CI/CD pipeline (GitHub Actions → ECR → EKS)
├── Design system starter (React component library)
├── Domain kernel package (base types, state machine, outbox)
└── Database: RLS template, migration tooling

WEEKS 3-4: WORKER & CANDIDATE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── worker-service (profiles, status, documents, preferences)
├── Candidate portal v1 (register, upload docs, set availability)
├── Admin portal v1 (worker list, search, basic filters)
├── Document upload + S3 storage
└── Basic notification (email via SendGrid/SES)

WEEKS 5-6: CREDENTIALING
━━━━━━━━━━━━━━━━━━━━━━━━
├── credential-service (types, requirements, verification status)
├── Facility requirement matrix (role × facility → required creds)
├── Upload → Extract (basic OCR via Textract)
├── Expiration tracking + alert job
├── Compliance status dashboard
├── ⛔ Blocking rules (expired = can't work)
└── 🤖 First AI: Document classification agent (what type is this?)

WEEKS 7-8: SCHEDULING (Per-Diem Marketplace)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── schedule-service (shifts, assignments, state machine)
├── client-service (facilities, departments, contacts)
├── Client portal v1 (create shifts, view assignments)
├── Worker mobile: browse shifts, apply, confirm
├── Eligibility check (worker meets facility requirements?)
├── Push notifications (shift available, confirmed, reminder)
└── 🤖 AI: Basic matching (rank workers for a shift)

WEEKS 9-10: TIME & ATTENDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── time-service (clock events, timecards, approval workflow)
├── Mobile: Clock in/out with geofence
├── Timecard generation from clock events
├── Validation rules (hours match schedule, OT detection)
├── Client approval portal (approve/reject timecards)
├── Exception workflow (flag → review → resolve)
└── Offline clock support (store locally, sync when connected)

WEEKS 11-12: PAY/BILL + MVP LAUNCH PREP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── payroll-prep-service (pay rules, earnings calc, batch)
├── billing-service (bill rules, invoice generation)
├── Pay rules engine (OT, differentials, holiday)
├── Export to payroll provider (Paycom/ADP format)
├── Invoice generation (per client, per period)
├── Basic analytics dashboard (fill rate, hours, revenue)
├── End-to-end testing (full lifecycle)
└── Pilot deployment to first tenant
```

---

### AFTER MVP (Weeks 13-24):

```
WEEKS 13-16: AI AGENT LAYER
├── AI platform service (model router, agent registry)
├── Candidate matching agent (score + rank)
├── Engagement agent (automated outreach sequences)
├── Pre-screen chatbot (qualification via conversation)
└── Scheduling optimizer (suggest best worker for shift)

WEEKS 17-20: RECRUITING (Full ATS)
├── recruit-service (job orders, applications, submissions, pipeline)
├── Client sales pipeline (leads → opportunities → clients)
├── Job board posting (Indeed, LinkedIn integration)
├── Interview scheduling
├── Offer management
└── Recruiting orchestrator agent

WEEKS 21-24: VMS + SCALE
├── VMS inbound (accept orders from client VMS platforms)
├── Supplier management (onboard agencies, score performance)
├── Order distribution logic (tiered, time-based)
├── Advanced analytics (forecasting, labor cost, margins)
├── Mobile app v2 (polish, ratings, favorites)
└── Multi-language (Spanish)
```

---

## SUMMARY: What's Different About Our Approach

| Traditional Approach | CareCareer Approach |
|---------------------|-------------------|
| Build Bullhorn clone first | Build the SHIFT LIFECYCLE first (revenue path) |
| Add AI later | AI agents from Week 5 (credential classification) |
| Compliance as afterthought | Compliance BLOCKS workflow from day one |
| Mobile as Phase 3 | Mobile clock-in is Week 9 (core to revenue) |
| Monolith then split | Microservices from day one (but only build what's needed) |
| Single database | Right database for each pattern (Postgres + DynamoDB + OpenSearch) |
| Build everything | Build smallest revenue-generating slice, expand from there |

---

*Ready to start coding. Next step: scaffold the monorepo and build tenant-service.*
