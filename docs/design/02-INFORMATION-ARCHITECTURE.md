# CareCareer Information Architecture

## Platform Navigation Model

The platform uses a persistent sidebar with role-adaptive sections.
Users see only modules relevant to their role and permissions.

---

## Global Shell (Always Present)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Logo] CareCareer    [Global Search] [⌘K]    [AI] [🔔] [Avatar ▾] │
├───────────┬─────────────────────────────────────────────────────────┤
│           │                                                         │
│ Sidebar   │   Main Content Area                                     │
│ Navigation│   (role-specific workspace)                             │
│           │                                                         │
│           │                                                         │
│           │                                                         │
└───────────┴─────────────────────────────────────────────────────────┘
```

## Navigation Sections by Role

### EXECUTIVE / PLATFORM ADMIN

| Section | Icon | Primary Views |
|---------|------|---------------|
| Command Center | ◉ | Executive dashboard, KPIs, AI briefing |
| Workforce | 👥 | Workers, candidates, talent pool |
| Recruiting | 🎯 | Pipeline, jobs, matching, submissions |
| Credentialing | ✓ | Readiness, compliance, gaps, expirations |
| Scheduling | 📅 | Calendar, shifts, coverage, assignments |
| Clients | 🏥 | Facilities, relationships, performance |
| Time & Pay | ⏱ | Timecards, payroll, billing, margin |
| Communications | 💬 | Messages, campaigns, engagement |
| Analytics | 📊 | Reports, dashboards, intelligence |
| Administration | ⚙ | Tenants, users, roles, integrations |

### RECRUITER

| Section | Icon | Primary Views |
|---------|------|---------------|
| My Dashboard | ◉ | Daily briefing, priority queue, KPIs |
| Candidates | 👤 | Pipeline, profiles, engagement |
| Jobs & Orders | 📋 | Open reqs, submissions, matches |
| Matching | 🤖 | AI studio, recommendations |
| Communications | 💬 | Outreach, sequences, responses |
| Tasks | ✓ | Follow-ups, deadlines, escalations |

### SCHEDULER / OPERATIONS

| Section | Icon | Primary Views |
|---------|------|---------------|
| Operations | ◉ | Coverage dashboard, exceptions, alerts |
| Scheduling | 📅 | Calendar, shifts, float pool |
| Workforce | 👥 | Available workers, credentials, status |
| Facilities | 🏥 | Site requirements, demand |
| Time & Attendance | ⏱ | Clock exceptions, approvals |

### CLIENT / FACILITY MANAGER

| Section | Icon | Primary Views |
|---------|------|---------------|
| Dashboard | ◉ | My facility KPIs, open needs |
| Staff Requests | 📋 | Create shifts, bulk orders |
| Applicants | 👤 | Review, credentials, confirm |
| Active Staff | 👥 | Assignments, schedule, performance |
| Timesheets | ⏱ | Review, approve, dispute |
| Invoices | 💰 | Billing, payments, history |

### WORKER / CAREGIVER (Mobile-First)

| Section | Icon | Primary Views |
|---------|------|---------------|
| Home | 🏠 | Next shift, readiness, earnings |
| Opportunities | 🔍 | Marketplace, recommended, map |
| My Schedule | 📅 | Upcoming, history, swaps |
| Time & Pay | ⏱ | Clock, timecards, earnings, instant pay |
| Credentials | ✓ | Status, expirations, uploads |
| Messages | 💬 | Notifications, recruiter comms |
| Profile | 👤 | Personal info, preferences, docs |

---

## Interaction Patterns

### Command Palette (⌘K)
Global quick-access to any entity, action, or navigation:
- "Find Sarah Johnson" → Candidate 360
- "Create shift at Mercy General" → Shift creation
- "Show expiring credentials" → Credential dashboard
- "Revenue this month" → Analytics

### AI Assistant Panel (Right Drawer)
Context-aware AI that adapts to the current screen:
- On Dashboard: executive briefing
- On Candidate: match recommendations
- On Schedule: coverage suggestions
- On Timecard: anomaly detection

### Notification Center
Grouped by type with action buttons:
- Credential expirations (urgent)
- Shift confirmations needed
- Timecard approvals pending
- New candidates matched
- Client requests

### Global Search
Searches across all entities:
- Workers/Candidates
- Facilities/Clients
- Shifts/Assignments
- Jobs/Orders
- Timecards
- Communications

---

## URL Structure

```
/command-center              Executive dashboard
/workforce                   Worker/candidate list
/workforce/:id              Candidate 360
/recruiting/pipeline        Recruiter pipeline
/recruiting/jobs            Jobs and orders
/recruiting/matching        AI matching studio
/credentialing              Compliance command center
/credentialing/:workerId    Worker credential detail
/scheduling                 Calendar and shift view
/scheduling/shifts/:id      Shift detail
/clients                    Facility list
/clients/:id                Client portal
/time                       Timecard management
/time/payroll               Payroll readiness
/communications             Message center
/analytics                  Reports and dashboards
/admin                      Platform administration
/admin/tenants              Tenant management
/admin/users                User management
```

---

## State Management

Each workspace maintains:
- Active filters (persisted per user)
- Selected entities
- Panel states (open/collapsed)
- Sort preferences
- View mode (grid/list/kanban/calendar)
- AI panel history

---

## Mobile Adaptation

At < 768px:
- Sidebar collapses to bottom tab bar (5 primary items)
- Content fills screen width
- Tables become card lists
- Drawers become full-screen sheets
- Command palette becomes search bar
- AI panel becomes floating button
