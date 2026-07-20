# CareCareer Accessibility Test Strategy

## Standard

WCAG 2.1 Level AA minimum for all CareCareer web applications.

## Automated Testing

### Tools

- `@axe-core/playwright` for automated violation detection
- Playwright role/label assertions for semantic structure
- Keyboard-only navigation tests
- Focus management tests

### What Automated Tests Cover

- Missing ARIA labels
- Color contrast violations
- Missing form labels
- Heading hierarchy violations
- Image alt text
- Landmark structure
- Table semantics
- Link/button role correctness
- Focus visibility

### What Requires Manual Review

- Screen-reader usability for complex workflows
- Scheduling grid accessibility
- Drag-and-drop alternatives
- Chart/visualization alternatives
- Live region behavior
- Dynamic validation announcement
- Complex form flow comprehension

## Implementation Plan

### Phase 1 (Current — GP-03.3)

- Install `@axe-core/playwright`
- Add baseline accessibility smoke to existing DEMO-01 specs
- Document known violations for remediation

### Phase 2 (GP-03.6)

- Full accessibility suite for identity administration UI
- Keyboard navigation for all forms
- Focus trapping in dialogs
- Error announcement

### Phase 3 (GP-07)

- Scheduling grid accessibility
- Shift-detail panel
- Calendar navigation
- Time-picker accessibility

## CI Integration

- PR: Accessibility smoke (critical violations fail the build)
- Main: Full accessibility regression
- Nightly: Cross-browser accessibility
- Release: Complete WCAG audit

## Violation Severity

| Severity | Policy                                      |
| -------- | ------------------------------------------- |
| Critical | Blocks PR merge                             |
| Serious  | Blocks PR merge (unless approved exception) |
| Moderate | Warning, tracked for resolution             |
| Minor    | Informational                               |

New critical/serious violations introduced in a PR must be fixed before merge.
Pre-existing violations are tracked with remediation timelines.
