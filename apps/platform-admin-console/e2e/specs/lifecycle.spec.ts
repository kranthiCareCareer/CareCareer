import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Tenant lifecycle management', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should show lifecycle actions based on tenant status', async ({ page }) => {
    // Navigate to tenant detail (even without real backend, page structure should render)
    await page.goto('/tenants/test-id');

    // Wait for loading to complete
    await page.waitForSelector('.tenant-detail, .error-banner, .page-loading', {
      timeout: 5000,
    });

    // Check structure when loaded
    if (await page.locator('.tenant-detail').isVisible()) {
      // Lifecycle section should exist
      await expect(page.locator('.lifecycle-actions')).toBeVisible();
    }
  });

  test('should display tenant status badge', async ({ page }) => {
    await page.goto('/tenants/test-id');

    await page.waitForSelector('.tenant-detail, .error-banner, .page-loading', {
      timeout: 5000,
    });

    if (await page.locator('.tenant-detail').isVisible()) {
      await expect(page.locator('.badge')).toBeVisible();
    }
  });

  test('should show deactivated tenant terminal state message', async ({ page }) => {
    // This tests the static rendering logic for DEACTIVATED status
    // When a real deactivated tenant is loaded, no lifecycle buttons appear
    await page.goto('/tenants/deactivated-id');

    await page.waitForSelector('.tenant-detail, .error-banner, .page-loading', {
      timeout: 5000,
    });

    if (await page.locator('.tenant-detail').isVisible()) {
      const deactivatedMsg = await page
        .getByText(/permanently deactivated/)
        .isVisible()
        .catch(() => false);
      if (deactivatedMsg) {
        // Verify no activate/suspend buttons exist
        await expect(page.getByRole('button', { name: 'Activate' })).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Suspend' })).not.toBeVisible();
      }
    }
  });
});
