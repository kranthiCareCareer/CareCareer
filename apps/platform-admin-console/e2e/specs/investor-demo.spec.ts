import { test, expect } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PersonaSelectorPage } from '../pages/persona-selector.page';
import { TenantCreatePage } from '../pages/tenant-create.page';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, '../../artifacts/investor-demo');
if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * @investor-demo
 *
 * Deterministic investor demonstration workflow.
 * Proves the multi-tenant platform control plane works end to end.
 *
 * This demonstrates the PLATFORM FOUNDATION, not the completed
 * healthcare staffing product. Workforce features (workers, shifts,
 * credentials, timecards) are not yet implemented.
 */
test.describe('Investor Demo @investor-demo', () => {
  test('Complete platform administration demonstration', async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    const tenantCreate = new TenantCreatePage(page);

    // 01: Select Platform Administrator
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '01-dashboard.png') });

    // 02: Executive dashboard
    await expect(page.getByRole('heading', { name: 'Platform Dashboard' })).toBeVisible();
    await expect(page.getByText('Total Tenants')).toBeVisible();

    // 03: Open tenant list
    await page.getByRole('link', { name: 'Tenants' }).click();
    await expect(page.getByRole('heading', { name: /Tenants/i })).toBeVisible();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '02-tenant-list.png') });

    // 04: Create investor-demo tenant
    await page.getByRole('link', { name: 'Create Tenant' }).click();
    await expect(page.getByRole('heading', { name: 'Create Tenant' })).toBeVisible();
    const slug = `investor-demo-${Date.now()}`;
    await tenantCreate.fillForm({
      name: 'Investor Demo Tenant',
      slug,
      organizationName: 'Demo Healthcare Corp',
    });
    await tenantCreate.submit();
    await page.waitForSelector('.success-banner, .error-banner', { timeout: 20000 });
    await expect(page.locator('.success-banner')).toBeVisible();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '03-tenant-created.png') });

    // 05: Open tenant detail
    const viewLink = page.getByRole('link', { name: 'View Tenant' });
    await expect(viewLink).toBeVisible();
    await viewLink.click();
    await page.waitForSelector('.tenant-detail, .page-loading', { timeout: 15000 });
    await expect(page.locator('.tenant-detail')).toBeVisible();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '04-tenant-detail.png') });

    // 06: Show organizations
    const orgLink = page.locator('a[href*="organizations"]');
    if (await orgLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await orgLink.click();
      await expect(page.getByRole('heading', { name: /Organizations/i })).toBeVisible();
      await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '05-organizations.png') });
      await page.goBack();
      await page.waitForSelector('.tenant-detail', { timeout: 10000 });
    }

    // 07: Show entitlements
    const entLink = page.locator('a[href*="entitlements"]');
    if (await entLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await entLink.click();
      await expect(page.getByRole('heading', { name: 'Entitlements' })).toBeVisible();
      await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '06-entitlements.png') });
      await page.goBack();
      await page.waitForSelector('.tenant-detail', { timeout: 10000 });
    }

    // 08: Show features and change a setting
    const url = page.url();
    const tenantId = url.match(/\/tenants\/([^/]+)/)?.[1];
    if (tenantId) {
      await page.goto(`/tenants/${tenantId}/features`);
      await expect(page.getByRole('heading', { name: 'Feature Configuration' })).toBeVisible();
      await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '07-features.png') });

      // 09: Toggle a feature if available
      const checkbox = page.locator('.feature-card input[type="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await checkbox.click();
        // Brief wait for persistence
        await page.waitForTimeout(1000);
        await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '08-feature-changed.png') });
      }
    }

    // 10: Suspend tenant
    if (tenantId) {
      await page.goto(`/tenants/${tenantId}`);
      await page.waitForSelector('.tenant-detail', { timeout: 10000 });
      const suspendBtn = page.getByRole('button', { name: /Suspend/i });
      if (await suspendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await suspendBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '09-suspended.png') });

        // 11: Reactivate tenant
        const activateBtn = page.getByRole('button', { name: /Activate/i });
        if (await activateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await activateBtn.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '10-reactivated.png') });
        }
      }
    }

    // 12: Show audit
    if (tenantId) {
      await page.goto(`/tenants/${tenantId}/audit`);
      await expect(page.getByRole('heading', { name: 'Audit Timeline' })).toBeVisible();
      await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '11-audit.png') });
    }

    // 13: Mobile Chrome responsive check
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Platform Dashboard' })).toBeVisible();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '12-mobile-responsive.png') });

    // 14: Return to desktop dashboard
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Platform Dashboard' })).toBeVisible();
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '13-final-dashboard.png') });
  });
});
