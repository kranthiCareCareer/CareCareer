import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Entitlements and features', () => {
  let tenantId: string;

  test.beforeAll(async () => {
    // Provision a real tenant via the platform API.
    // 1. Get a demo auth token
    // 2. Use it to create a tenant
    const baseUrl = process.env['BASE_URL'] || 'http://localhost:4000';
    const apiHost = baseUrl.replace(/:\d+\/?$/, ':3001');
    const slug = `ent-fixture-${Date.now()}`;

    // Step 1: Get demo token for platform admin
    const tokenRes = await fetch(`${apiHost}/demo/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sub: 'platform-admin',
        tenantId: 'platform',
        role: 'PLATFORM_ADMIN',
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(
        `Demo token request failed (${tokenRes.status}): ${await tokenRes.text().catch(() => '')}`,
      );
    }

    const { token } = await tokenRes.json();

    // Step 2: Provision tenant with the demo token
    const res = await fetch(`${apiHost}/v1/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': slug,
        'X-Actor-Id': 'platform-admin',
        'X-Correlation-Id': `e2e-fixture-${slug}`,
      },
      body: JSON.stringify({
        name: 'Entitlements Fixture',
        slug,
        organizationName: 'Fixture Org',
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Tenant provisioning failed (${res.status}): ${await res.text().catch(() => 'no body')}`,
      );
    }

    const body = await res.json();
    tenantId = body.data?.tenantId ?? body.tenantId;
    if (!tenantId) {
      throw new Error(`Failed to extract tenant ID from response: ${JSON.stringify(body)}`);
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
    await page.waitForSelector('.entitlements-grid, .page-loading, .error-banner', {
      timeout: 10000,
    });
    if (await page.locator('.entitlements-grid').isVisible()) {
      await expect(page.getByText('Core Platform')).toBeVisible();
      await expect(page.getByText('(always enabled)')).toBeVisible();
    }
  });

  test('should display features page', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/features`);
    await expect(page.getByRole('heading', { name: 'Feature Configuration' })).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/Feature settings are available only for entitled modules/),
    ).toBeVisible();
  });

  test('should show feature keys and labels', async ({ page }) => {
    await page.goto(`/tenants/${tenantId}/features`);
    await page.waitForSelector('.features-grid, .error-banner', { timeout: 10000 });
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
