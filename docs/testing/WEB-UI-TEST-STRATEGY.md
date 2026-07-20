# CareCareer Web UI Test Strategy

## Framework

| Tool                 | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| Playwright Test      | Primary web E2E and workflow framework             |
| @axe-core/playwright | Automated accessibility testing                    |
| Chromium             | Primary browser target (PR + regression)           |
| Firefox              | Nightly cross-browser validation                   |
| WebKit               | Nightly cross-browser validation                   |
| Chrome (branded)     | Release candidate validation                       |
| Edge (branded)       | Release candidate validation                       |
| Appium               | Future native iOS/Android (when native apps exist) |

## Current State (GP-03.3)

- **Playwright version**: 1.52.0
- **Application**: platform-admin-console (Next.js)
- **Browser projects**: Chromium only
- **E2E specs**: 10 spec files, 20 Chromium tests (DEMO-01)
- **Page objects**: 9 page classes
- **Personas**: 4 (Platform Admin, MAS Admin, CareShield Admin, Auditor)
- **CI workflow**: `demo-e2e.yml` runs Chromium on PR
- **Accessibility**: Not yet configured (@axe-core/playwright not installed)
- **Visual regression**: Not yet configured
- **Cross-browser**: Not yet configured (Chromium only)

## Execution Tiers

### Pull Request (chromium-pr)

- Chromium smoke tests
- Changed-feature workflow tests
- Authentication smoke
- Critical tenant-isolation tests
- Accessibility smoke (once configured)
- No console-error checks

### Main Branch (chromium-regression)

- Full Chromium workflow regression
- All personas affected by the change
- All lifecycle states affected by the change
- API postcondition validation
- Accessibility regression for changed pages

### Nightly (cross-browser)

- Full Chromium
- Full Firefox
- Full WebKit
- Responsive web device projects
- Cross-browser navigation
- Keyboard navigation
- Visual smoke tests

### Release Candidate (release)

- All Chromium, Firefox, WebKit
- Google Chrome stable
- Microsoft Edge stable
- All critical workflows
- All high-risk role combinations
- All cross-tenant denial scenarios
- Visual regression
- Accessibility regression

## Locator Standards

Preferred order:

1. `getByRole` — buttons, headings, links, navigation
2. `getByLabel` — form fields
3. `getByText` — when text is a contractual element
4. `getByPlaceholder` — fallback for unlabeled inputs
5. `getByTestId` — explicit stable contracts (business-named)

Prohibited:

- CSS hierarchy selectors (fragile)
- XPath tied to DOM structure
- nth-child selectors
- Generated class names
- `page.waitForTimeout()` as synchronization

## Test-Data Rules

- Deterministic and idempotent
- Tenant-isolated
- Free of real PII/PHI
- Time-zone explicit
- Lifecycle-state explicit
- Each test owns its records
- Parallel tests never share mutable state

## Flakiness Policy

- No arbitrary sleeps
- No test-order dependence
- No shared mutable browser state
- Retries in CI for infrastructure issues only, not logic
- Quarantined critical tests block release
- Every quarantined test has a tracked issue with deadline

## Golden Path Phase Responsibility

| Phase   | Playwright Responsibility                              |
| ------- | ------------------------------------------------------ |
| GP-03.3 | Authentication lifecycle, session UI (if present)      |
| GP-03.6 | Identity administration UI (users, memberships, roles) |
| GP-04   | Worker/facility profiles                               |
| GP-05   | Credentialing and compliance workflows                 |
| GP-06   | ATS, requisitions, candidate pipelines                 |
| GP-07   | Scheduling, shifts (highest UI priority)               |
| GP-08   | Matching results, eligibility                          |
| GP-09   | Timekeeping, timecards, approvals                      |
| GP-10   | Pay/bill preview                                       |
| GP-11+  | Notifications, integrations, AI, reporting             |
| Native  | Appium for iOS/Android; Playwright for responsive web  |

## Definition of Done for UI Workflows

A UI workflow is complete only when:

- [ ] Use case documented
- [ ] Routes inventoried
- [ ] Personas identified
- [ ] Permissions tested (authorized + denied)
- [ ] Tenant isolation tested
- [ ] Primary workflow passes
- [ ] Alternative workflow passes
- [ ] Failure workflow passes
- [ ] State transitions tested
- [ ] Backend postcondition validated
- [ ] Accessibility passes
- [ ] Chromium passes
- [ ] No unexpected console errors
- [ ] No unexpected network errors
- [ ] Traceability matrix updated
