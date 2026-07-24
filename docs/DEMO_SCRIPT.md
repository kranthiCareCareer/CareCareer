# CareCareer Executive Demo Script

## Duration: 10 minutes

## Setup (before demo)

```bash
make demo-up
make demo-seed
```

Verify: http://localhost:8080 shows login screen.

---

## Act 1: Platform Administration (2 min)

1. Select **"Platform Administrator"** persona
2. Show the Dashboard — multi-tenant overview
3. Navigate to **Tenants** — show MAS Medical Staffing
4. Navigate to **Facilities** — show Mercy General Hospital
5. Navigate to **Workers** — show Sarah Johnson (RN, ACTIVE)
6. Navigate to **Audit** — show operational history

**Key point:** "Complete visibility across all tenants, facilities, and workforce."

---

## Act 2: Client Creates Demand (2 min)

1. Log out → Select **"Client — Mercy General Hospital"** persona
2. Navigate to **Create Shift**
3. Fill in: RN, tomorrow 7am-7pm, $45/hr pay, $75/hr bill
4. Submit → shift created in DRAFT
5. Navigate to **Shifts** → show the new shift
6. (API: publish the shift)

**Key point:** "Hiring managers create and publish shifts in seconds."

---

## Act 3: Worker Marketplace (2 min)

1. Log out → Select **"Worker — Sarah Johnson (RN)"** persona
2. Navigate to **Available Shifts** (marketplace)
3. Show the published shift with pay rate and schedule
4. Click **"Request Shift"**
5. Navigate to **Notifications** — show confirmation of request

**Key point:** "Workers see only shifts they're qualified for. One-tap request."

---

## Act 4: Confirmation and Assignment (2 min)

1. Log out → Select **"Client — Mercy General"** persona
2. Navigate to **Shift Requests** — show pending request from Sarah
3. Click **"Confirm"** — assignment created atomically
4. Log out → Select **"Worker — Sarah Johnson"** persona
5. Navigate to **My Assignments** — show CONFIRMED assignment
6. Check **Notifications** — assignment confirmation notification

**Key point:** "Atomic confirmation prevents double-booking."

---

## Act 5: Timekeeping and Approval (2 min)

1. As Worker, click **"Clock In"** on the assignment
2. (Show clock event recorded with timestamp)
3. Click **"Clock Out"**
4. Navigate to **Timecards** → submit timecard
5. Log out → Select **"Client — Mercy General"**
6. Navigate to **Timecards** — show submitted timecard with hours
7. Click **"Approve"**
8. Open http://localhost:8025 — show MailHog received notification emails

**Key point:** "Complete audit trail from clock-in to approved timecard."

---

## Closing Slide Points

- ✅ Multi-tenant with PostgreSQL RLS (tenant A cannot see tenant B)
- ✅ Role-based access (admin, worker, client each see only their view)
- ✅ Deterministic eligibility (credential-based, auditable)
- ✅ Optimistic concurrency (no lost updates)
- ✅ Immutable audit trail
- ✅ Notification delivery via email and in-app
- ✅ Ready for AWS deployment (Terraform + ECS planned)

---

## If Questions Arise

- **"What about mobile?"** → React Native planned, shared API contracts
- **"How does this scale?"** → Each service independently deployable on ECS Fargate
- **"What about compliance?"** → HIPAA-ready: no PHI in logs, RLS isolation, audit trail
- **"Timeline to production?"** → 2-3 weeks for AWS staging after local acceptance
