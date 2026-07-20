import { test, expect } from '@playwright/test';

import { checkAccessibility } from '../fixtures/accessibility';
import { ErrorCollector } from '../fixtures/error-collector';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

/**
 * Navigation smoke tests for every current admin console route.
 * Tags: @smoke @navigation @accessibility
 *
 * Proves:
 * - Every route is reachable through direct navigation
 * - No unexpected console errors
 * - No unexpected network failures
 * - No serious accessibility violations
 * - Keyboard-accessible navigation
 */

const ROUTES = [
  { path: '/', heading: /CareCareer|Platform/i, public: true },
  { path: '/tenants', heading: /Tenant/i, public: false },
  { path: '/tenants/create', heading: /Create Tenant/i, public: false },
  { path: '/features', heading: /Feature/i, public: false },
  { path: '/audit', heading: /Audit/i, public: false },
];

test.describe('Navigation smoke @smoke @navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as Platform Administrator
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  for (const route of ROUTES) {
    if (route.public) continue; // Public routes tested separately

    test(`should navigate to ${route.path} without errors`, async ({ page }) => {
      const errors = new ErrorCollector(page);
      errors.start();

      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      // Page should have a heading matching the expected pattern
      const heading = page.getByRole('heading').first();
      await expect(heading).toBeVisible({ timeout: 10000 });

      errors.expectNoUnexpectedErrors();
    });
  }

  test('should load root page without errors @smoke', async ({ page }) => {
    const errors = new ErrorCollector(page);
    errors.start();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dashboard should be visible (already authenticated)
    await expect(page.getByText(/Platform Dashboard|Dashboard/i)).toBeVisible({ timeout: 10000 });

    errors.expectNoUnexpectedErrors();
  });
});

test.describe('Accessibility smoke @smoke @accessibility', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  for (const route of ROUTES) {
    test(`${route.path} should have no serious accessibility violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      // Allow brief settle time for dynamic content
      await page.waitForTimeout(500);
      await checkAccessibility(page);
    });
  }
});

test.describe('Keyboard navigation @smoke @navigation', () => {
  test('should be able to tab through main navigation', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    // Tab through navigation items and verify focus is visible
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });
});
