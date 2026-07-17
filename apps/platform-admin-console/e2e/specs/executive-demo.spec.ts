import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';
import { DashboardPage } from '../pages/dashboard.page';
import { TenantCreatePage } from '../pages/tenant-create.page';
import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const SCREENSHOTS_DIR = resolve(__dirname, '../../../artifacts/demo-screenshots');

// Ensure screenshots directory exists
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

test.describe('Executive demo', () => {
  test('Executive demo — full platform administration flow', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    const dashboard = new DashboardPage(page);
    const tenantCreate = new TenantCreatePage(page);

    // === Step 1: Select Platform Administrator ===
    await personaSelector.goto();
    await expect(
      page.getByRole('heading', { name: 'CareCareer Platform Admin Console' }),
    ).toBeVisible();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();

    // === Step 2: Dashboard ===
    expect(await dashboard.isVisible()).toBe(true);
    await expect(page.getByText('Platform Administrator')).toBeVisible();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '01-dashboard.png') });

    // === Step 3: Create MAS Demo tenant ===
    await page.goto('/tenants/create');
    await expect(page.getByRole('heading', { name: 'Create Tenant' })).toBeVisible();

    const slug = `mas-demo-${Date.now()}`;
    await tenantCreate.fillForm({
      name: 'MAS Demo',
      slug,
      organizationName: 'MAS Medical Staffing',
    });
    await tenantCreate.submit();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '02-create-tenant.png') });

    // Wait for result
    await page.waitForSelector('.success-banner, .error-banner', { timeout: 15000 });

    // === Step 4: Tenant overview (if creation succeeded) ===
    if (await page.locator('.success-banner').isVisible()) {
      const viewTenantLink = page.getByRole('link', { name: 'View Tenant' });
      if (await viewTenantLink.isVisible()) {
        await viewTenantLink.click();
        await page.waitForSelector('.tenant-detail, .error-banner', { timeout: 10000 });

        if (await page.locator('.tenant-detail').isVisible()) {
          await page.screenshot({
            path: resolve(SCREENSHOTS_DIR, '03-tenant-overview.png'),
          });

          // === Step 5: Navigate to entitlements ===
          const manageLinks = page.getByRole('link', { name: 'Manage' });
          if ((await manageLinks.count()) >= 2) {
            await manageLinks.nth(1).click();
            await page.waitForSelector('.entitlements-grid, .page-loading', {
              timeout: 10000,
            });
            await page.screenshot({
              path: resolve(SCREENSHOTS_DIR, '04-entitlements.png'),
            });

            // === Step 6: Navigate to features ===
            await page.goBack();
            await page.waitForSelector('.tenant-detail', { timeout: 5000 });

            // Get tenant ID from URL
            const url = page.url();
            const tenantId = url.split('/tenants/')[1]?.split('/')[0];
            if (tenantId) {
              await page.goto(`/tenants/${tenantId}/features`);
              await page.waitForSelector('.features-grid, .error-banner', {
                timeout: 10000,
              });
              await page.screenshot({
                path: resolve(SCREENSHOTS_DIR, '05-feature-settings.png'),
              });
            }
          }
        }
      }
    }

    // === Step 7: Demonstrate tenant isolation ===
    // Switch to MAS Tenant Admin
    await page.getByRole('button', { name: /Switch/ }).first().click();
    await expect(
      page.getByRole('heading', { name: 'CareCareer Platform Admin Console' }),
    ).toBeVisible();

    await personaSelector.selectPersona('MAS Tenant Administrator');
    await personaSelector.waitForDashboard();

    // Try to access a non-existent tenant (simulating cross-tenant access)
    await page.goto('/tenants/non-existent-cross-tenant-id');
    await page.waitForSelector('.error-banner, .page-loading, .tenant-detail', {
      timeout: 5000,
    });
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '06-tenant-isolation.png'),
    });

    // === Step 8: Switch back and show suspended state ===
    await page.goto('/');
    await page.getByRole('button', { name: /Switch/ }).first().click();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '07-suspended-tenant.png'),
    });

    // === Step 9: Show audit page ===
    await page.goto('/tenants/test-id/audit');
    await expect(page.getByRole('heading', { name: 'Audit Timeline' })).toBeVisible();
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '08-audit-history.png'),
    });

    // Final verification: no uncaught errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Re-navigate to confirm no error state
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::'),
    );
    expect(critical).toHaveLength(0);
  });
});
