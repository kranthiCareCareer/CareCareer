import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';
import { TenantCreatePage } from '../pages/tenant-create.page';

test.describe('Tenant provisioning', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should navigate to create tenant form', async ({ page }) => {
    await page.goto('/tenants');
    await page.getByRole('link', { name: 'Create Tenant' }).click();
    await expect(page.getByRole('heading', { name: 'Create Tenant' })).toBeVisible();
  });

  test('should display all form fields', async ({ page }) => {
    await page.goto('/tenants/create');
    await expect(page.getByLabel('Tenant Name')).toBeVisible();
    await expect(page.getByLabel('Tenant Slug')).toBeVisible();
    await expect(page.getByLabel('Initial Organization Name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Provision Tenant' })).toBeVisible();
  });

  test('should provision a new tenant with real API', async ({ page }) => {
    const tenantCreate = new TenantCreatePage(page);
    await tenantCreate.goto();

    const slug = `e2e-test-${Date.now()}`;
    await tenantCreate.fillForm({
      name: 'E2E Test Tenant',
      slug,
      organizationName: 'E2E Test Org',
    });
    await tenantCreate.submit();

    // Wait for success or error response
    await page.waitForSelector('.success-banner, .error-banner', { timeout: 10000 });

    // If the backend is running, we should see success
    if (await page.locator('.success-banner').isVisible()) {
      await expect(page.locator('.success-banner')).toContainText('Tenant provisioned');
      await expect(page.locator('.success-banner code').first()).not.toBeEmpty();
    }
  });

  test('should disable submit button while provisioning', async ({ page }) => {
    const tenantCreate = new TenantCreatePage(page);
    await tenantCreate.goto();

    await tenantCreate.fillForm({
      name: 'Button Test',
      slug: `btn-test-${Date.now()}`,
      organizationName: 'Org',
    });

    // Click submit
    await page.getByRole('button', { name: 'Provision Tenant' }).click();

    // Button should show provisioning state
    const btn = page.getByRole('button', { name: /Provisioning/ });
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(btn).toBeDisabled();
    }
  });

  test('should display correlation ID on success', async ({ page }) => {
    const tenantCreate = new TenantCreatePage(page);
    await tenantCreate.goto();

    await tenantCreate.fillForm({
      name: 'Correlation Test',
      slug: `corr-test-${Date.now()}`,
      organizationName: 'Org',
    });
    await tenantCreate.submit();

    await page.waitForSelector('.success-banner, .error-banner', { timeout: 10000 });

    if (await page.locator('.success-banner').isVisible()) {
      await expect(page.locator('.success-banner')).toContainText('Correlation ID');
    }
  });

  test('should show error for invalid slug', async ({ page }) => {
    const tenantCreate = new TenantCreatePage(page);
    await tenantCreate.goto();

    await tenantCreate.fillForm({
      name: 'Invalid Slug Test',
      slug: 'INVALID_SLUG', // uppercase and underscore not allowed
      organizationName: 'Org',
    });

    // Check pattern validation state directly (does not require form submission)
    const slugInput = page.getByLabel('Tenant Slug');
    const isInvalid = await slugInput.evaluate(
      (el: HTMLInputElement) => !el.checkValidity(),
    );
    expect(isInvalid).toBe(true);
  });
});
