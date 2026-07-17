import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Organizations and branches', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should display organizations page heading', async ({ page }) => {
    // Navigate to a known tenant's organizations
    await page.goto('/tenants/test-id/organizations');
    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();
  });

  test('should show create organization form', async ({ page }) => {
    await page.goto('/tenants/test-id/organizations');
    await expect(page.getByLabel('Organization name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Organization' })).toBeVisible();
  });

  test('should have breadcrumb back to tenant', async ({ page }) => {
    await page.goto('/tenants/test-id/organizations');
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });

  test('should show empty state when no organizations loaded', async ({ page }) => {
    await page.goto('/tenants/nonexistent/organizations');

    // Should show empty state or error
    const empty = await page
      .getByText(/No organizations/)
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const error = await page
      .locator('.error-banner')
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(empty || error).toBeTruthy();
  });
});
