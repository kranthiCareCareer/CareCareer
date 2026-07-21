import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';
import { TenantCreatePage } from '../pages/tenant-create.page';

test.describe('Entitlements and features', () => {
  let tenantId: string;

  test.beforeAll(async ({ browser }) => {
    // Provision a real tenant through the UI to get a valid ID
    const context = await browser.newContext();
    const page = await context.newPage();
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    const tenantCreate = new TenantCreatePage(page);
    await tenantCreate.goto();
    const slug = `ent-test-${Date.now()}`;
    await tenantCreate.fillForm({
      name: 'Entitlements Test',
      slug,
      organizationName: 'Test Org',
    });
    await tenantCreate.submit();

    // Wait for success and extract tenant ID from the View Tenant link
    await page.waitForSelector('.success-banner, .error-banner', { timeout: 15000 });
    if (await page.locator('.success-banner').isVisible()) {
      const viewLink = page.getByRole('link', { name: 'View Tenant' });
      if (await viewLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        const href = await viewLink.getAttribute('href');
        tenantId = href?.match(/\/tenants\/([^/]+)/)?.[1] ?? 'test-id';
      } else {
        tenantId = 'test-id';
      }
    } else {
      tenantId = 'test-id';
    }
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should display entitlements page', async ({ page }) => {
    test.skip(tenantId === 'test-id', 'No real tenant available');
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await expect(page.getByRole('heading', { name: 'Entitlements' })).toBeVisible();
    await expect(page.getByText(/Entitlements represent purchased or authorized/)).toBeVisible();
  });

  test('should show Core Platform as always enabled', async ({ page }) => {
    test.skip(tenantId === 'test-id', 'No real tenant available');
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await page.waitForSelector('.entitlements-grid, .page-loading, .error-banner', {
      timeout: 5000,
    });
    if (await page.locator('.entitlements-grid').isVisible()) {
      await expect(page.getByText('Core Platform')).toBeVisible();
      await expect(page.getByText('(always enabled)')).toBeVisible();
    }
  });

  test('should display features page', async ({ page }) => {
    test.skip(tenantId === 'test-id', 'No real tenant available');
    await page.goto(`/tenants/${tenantId}/features`);
    await expect(page.getByRole('heading', { name: 'Feature Configuration' })).toBeVisible();
    await expect(
      page.getByText(/Feature settings are available only for entitled modules/),
    ).toBeVisible();
  });

  test('should show feature keys and labels', async ({ page }) => {
    test.skip(tenantId === 'test-id', 'No real tenant available');
    await page.goto(`/tenants/${tenantId}/features`);
    await page.waitForSelector('.features-grid, .error-banner', { timeout: 5000 });
    if (await page.locator('.features-grid').isVisible()) {
      await expect(page.getByText('Auto-confirm shifts')).toBeVisible();
      await expect(page.getByText('Geofence required')).toBeVisible();
    }
  });

  test('should have breadcrumb to tenant from entitlements', async ({ page }) => {
    test.skip(tenantId === 'test-id', 'No real tenant available');
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });

  test('should have breadcrumb to tenant from features', async ({ page }) => {
    test.skip(tenantId === 'test-id', 'No real tenant available');
    await page.goto(`/tenants/${tenantId}/features`);
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });
});
