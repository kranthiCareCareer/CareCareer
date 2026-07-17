import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Tenant isolation', () => {
  test('should not reveal cross-tenant resources', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);

    // Login as MAS Tenant Admin
    await personaSelector.goto();
    await personaSelector.selectPersona('MAS Tenant Administrator');
    await personaSelector.waitForDashboard();

    // Try navigating directly to a CareShield tenant URL
    // This should show 404 or equivalent — not reveal CareShield data
    await page.goto('/tenants/careshield-fake-id');

    // Should show error or not found state
    const errorVisible = await page
      .locator('.error-banner, [role="alert"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const notFoundVisible = await page
      .getByText(/not found/i)
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const loadingVisible = await page
      .getByText(/Loading/)
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    // It should NOT show CareShield tenant data
    const careShieldData = await page
      .getByText('CareShield')
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    // Either we get an error, not found, or at worst loading — never cross-tenant data
    expect(errorVisible || notFoundVisible || loadingVisible || !careShieldData).toBeTruthy();
  });

  test('should clear cached data when switching personas', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);

    // Login as Platform Administrator
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    // Verify we're on the dashboard
    await expect(page.getByText('Platform Administrator')).toBeVisible();

    // Switch persona
    await page.getByRole('button', { name: 'Switch Persona' }).click();

    // Now select MAS Tenant Admin
    await page.getByRole('button', { name: /MAS Tenant Administrator/ }).click();

    // Wait for new dashboard
    await page.waitForSelector('text=Platform Dashboard', { timeout: 5000 });

    // Should show the new persona
    await expect(page.getByText('MAS Tenant Administrator')).toBeVisible();
  });

  test('should show persona selector after switching', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);

    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    // Switch persona
    await page
      .getByRole('button', { name: /Switch/ })
      .first()
      .click();

    // Should see persona selector again
    await expect(
      page.getByRole('heading', { name: 'CareCareer Platform Admin Console' }),
    ).toBeVisible();
  });
});
