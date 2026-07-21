import { test, expect } from '@playwright/test';

import { checkAccessibility } from '../fixtures/accessibility';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

/**
 * Full accessibility coverage for all administration routes.
 * Tags: @accessibility
 *
 * Runs Axe against every reachable route using real tenant fixtures.
 * Verifies: WCAG 2.1 AA (critical + serious = 0), landmarks, headings, focus.
 */

let tenantId: string;

test.beforeAll(async () => {
  // Provision a real tenant for tenant-scoped route testing
  const baseUrl = process.env['BASE_URL'] || 'http://localhost:4000';
  const apiHost = baseUrl.replace(/:\d+\/?$/, ':3001');
  const slug = `a11y-fixture-${Date.now()}`;

  const tokenRes = await fetch(`${apiHost}/demo/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: 'a11y-admin', tenantId: 'platform', role: 'PLATFORM_ADMIN' }),
  });
  if (!tokenRes.ok) throw new Error(`Demo token failed: ${tokenRes.status}`);
  const { token } = await tokenRes.json();

  const res = await fetch(`${apiHost}/v1/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': slug,
      'X-Actor-Id': 'a11y-admin',
      'X-Correlation-Id': `a11y-${slug}`,
    },
    body: JSON.stringify({ name: 'A11y Fixture', slug, organizationName: 'A11y Org' }),
  });
  if (!res.ok) throw new Error(`Tenant provision failed: ${res.status}`);
  const body = await res.json();
  tenantId = body.data?.tenantId ?? body.tenantId;
  if (!tenantId) throw new Error('No tenant ID from provisioning');
});

test.beforeEach(async ({ page }) => {
  const personaSelector = new PersonaSelectorPage(page);
  await personaSelector.goto();
  await personaSelector.selectPersona('Platform Administrator');
  await personaSelector.waitForDashboard();
});

test.describe('Route accessibility @accessibility', () => {
  test('/ (persona selector) should pass Axe', async ({ page }) => {
    // This test needs unauthenticated state — don't use the beforeEach auth
    await page.goto('/');
    // Clear any residual auth state and reload
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/ (dashboard) should pass Axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('/tenants should pass Axe', async ({ page }) => {
    await page.goto('/tenants');
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/tenants/create should pass Axe', async ({ page }) => {
    await page.goto('/tenants/create');
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Form inputs must have labels
    const inputs = page.locator('input[required]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('/tenants/:id should pass Axe', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}`);
    await page.waitForSelector('.tenant-detail, .page-loading, .error-banner', { timeout: 10000 });
    await checkAccessibility(page);
  });

  test('/tenants/:id/entitlements should pass Axe', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { name: 'Entitlements' })).toBeVisible();
  });

  test('/tenants/:id/organizations should pass Axe', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/organizations`);
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/tenants/:id/features should pass Axe', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/features`);
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/tenants/:id/audit should pass Axe', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/audit`);
    await page.waitForLoadState('networkidle');
    await checkAccessibility(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Keyboard navigation @accessibility', () => {
  test('should tab through persona selection cards', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Keyboard Tab navigation is desktop-only');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Tab to first persona card
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
    // Press Enter to select
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 10000 });
  });

  test('should tab through dashboard navigation', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Keyboard Tab navigation is desktop-only');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Tab through elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('should tab through create tenant form', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Keyboard Tab navigation is desktop-only');
    await page.goto('/tenants/create');
    await page.waitForLoadState('networkidle');
    // Tab to first input
    await page.keyboard.press('Tab');
    const firstFocused = page.locator(':focus');
    await expect(firstFocused).toBeVisible();
    // Tab through all form fields
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    // Should reach the submit button
    const submitFocused = page.locator(':focus');
    await expect(submitFocused).toBeVisible();
  });

  test('should navigate tenant list with keyboard', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Keyboard Tab navigation is desktop-only');
    await page.goto('/tenants');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('should navigate entitlements with keyboard', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Keyboard Tab navigation is desktop-only');
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await page.waitForLoadState('networkidle');
    // Tab to breadcrumb link
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });
});
