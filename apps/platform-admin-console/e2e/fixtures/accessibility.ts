import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Reusable accessibility helper for CareCareer E2E tests.
 * Runs axe-core against the current page and fails on serious/critical violations.
 *
 * Usage:
 *   await checkAccessibility(page);
 *   await checkAccessibility(page, { scope: '#main-content' });
 */

/** Known framework-level violations that are documented and tracked */
const APPROVED_EXCEPTIONS: string[] = [
  // Add rule IDs here as needed with documented justification
  // Example: 'color-contrast' for known dark-mode-only issue tracked in CC-XXX
];

export interface AccessibilityCheckOptions {
  /** CSS selector to scope the check (default: full page) */
  scope?: string;
  /** Additional rule IDs to exclude beyond the approved list */
  additionalExclusions?: string[];
}

export async function checkAccessibility(
  page: Page,
  options?: AccessibilityCheckOptions,
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

  if (options?.scope) {
    builder = builder.include(options.scope);
  }

  const exclusions = [...APPROVED_EXCEPTIONS, ...(options?.additionalExclusions ?? [])];
  if (exclusions.length > 0) {
    builder = builder.disableRules(exclusions);
  }

  const results = await builder.analyze();

  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  if (serious.length > 0) {
    const summary = serious
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} occurrence${v.nodes.length > 1 ? 's' : ''})`,
      )
      .join('\n  ');
    expect.soft(serious, `Accessibility violations found:\n  ${summary}`).toHaveLength(0);
  }
}
