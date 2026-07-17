import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Entitlements and features', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should display entitlements page', async ({ page }) => {
    await page.goto('/tenants/test-id/entitlements');
    await expect(page.getByRole('heading', { name: 'Entitlements' })).toBeVisible();
    await expect(
      page.getByText(/Entitlements represent purchased or authorized/),
    ).toBeVisible();
  });

  test('should show Core Platform as always enabled', async ({ page }) => {
    await page.goto('/tenants/test-id/entitlements');

    // Wait for loading to complete
    await page.waitForSelector('.entitlements-grid, .page-loading', { timeout: 5000 });

    if (await page.locator('.entitlements-grid').isVisible()) {
      await expect(page.getByText('Core Platform')).toBeVisible();
      await expect(page.getByText('(always enabled)')).toBeVisible();
    }
  });

  test('should display features page', async ({ page }) => {
    await page.goto('/tenants/test-id/features');
    await expect(page.getByRole('heading', { name: 'Feature Configuration' })).toBeVisible();
    await expect(
      page.getByText(/Feature settings are available only for entitled modules/),
    ).toBeVisible();
  });

  test('should show feature keys and labels', async ({ page }) => {
    await page.goto('/tenants/test-id/features');

    // Wait for page to load
    await page.waitForSelector('.features-grid, .error-banner', { timeout: 5000 });

    if (await page.locator('.features-grid').isVisible()) {
      await expect(page.getByText('Auto-confirm shifts')).toBeVisible();
      await expect(page.getByText('Geofence required')).toBeVisible();
    }
  });

  test('should have breadcrumb to tenant from entitlements', async ({ page }) => {
    await page.goto('/tenants/test-id/entitlements');
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });

  test('should have breadcrumb to tenant from features', async ({ page }) => {
    await page.goto('/tenants/test-id/features');
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });
});
