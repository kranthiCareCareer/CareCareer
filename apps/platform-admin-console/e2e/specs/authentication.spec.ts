import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Authentication', () => {
  test('should show persona selector on initial load', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();

    expect(await personaSelector.isVisible()).toBe(true);
  });

  test('should display demo mode warning badge', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('DEMO MODE — Development Only')).toBeVisible();
  });

  test('should show all four personas', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Platform Administrator' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MAS Tenant Administrator' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'CareShield Tenant Administrator' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Read-Only Auditor' })).toBeVisible();
  });

  test('should navigate to dashboard after selecting persona', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    const dashboard = new DashboardPage(page);

    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    expect(await dashboard.isVisible()).toBe(true);
  });

  test('should display persona name on dashboard', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    const dashboard = new DashboardPage(page);

    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    const name = await dashboard.getSignedInAs();
    expect(name).toContain('Platform Administrator');
  });

  test('should return to persona selector on switch', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    const dashboard = new DashboardPage(page);

    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
    await dashboard.clickSwitchPersona();

    expect(await personaSelector.isVisible()).toBe(true);
  });
});
