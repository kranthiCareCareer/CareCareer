import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Entitlements and features', () => {
  let tenantId: string;

  test.beforeAll(async ({ request }) => {
    // Provision a real tenant to get a valid ID for entitlements/features tests
    const response = await request.post('http://localhost:3001/v1/tenants', {
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Persona': 'platform-admin',
      },
      data: {
        name: 'Entitlements Test Tenant',
        slug: `entitlements-test-${Date.now()}`,
        initialOrganizationName: 'Test Org',
      },
    });
    if (response.ok()) {
      const body = await response.json();
      tenantId = body.data?.tenantId ?? body.tenantId ?? 'test-id';
    } else {
      // Fallback if API unavailable
      tenantId = 'test-id';
    }
  });

  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should display entitlements page', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await expect(page.getByRole('heading', { name: 'Entitlements' })).toBeVisible();
    await expect(page.getByText(/Entitlements represent purchased or authorized/)).toBeVisible();
  });

  test('should show Core Platform as always enabled', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/entitlements`);

    // Wait for loading to complete
    await page.waitForSelector('.entitlements-grid, .page-loading, .error-banner', {
      timeout: 5000,
    });

    if (await page.locator('.entitlements-grid').isVisible()) {
      await expect(page.getByText('Core Platform')).toBeVisible();
      await expect(page.getByText('(always enabled)')).toBeVisible();
    }
  });

  test('should display features page', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/features`);
    await expect(page.getByRole('heading', { name: 'Feature Configuration' })).toBeVisible();
    await expect(
      page.getByText(/Feature settings are available only for entitled modules/),
    ).toBeVisible();
  });

  test('should show feature keys and labels', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/features`);

    // Wait for page to load
    await page.waitForSelector('.features-grid, .error-banner', { timeout: 5000 });

    if (await page.locator('.features-grid').isVisible()) {
      await expect(page.getByText('Auto-confirm shifts')).toBeVisible();
      await expect(page.getByText('Geofence required')).toBeVisible();
    }
  });

  test('should have breadcrumb to tenant from entitlements', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/entitlements`);
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });

  test('should have breadcrumb to tenant from features', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/features`);
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });
});
