import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Audit timeline', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should display audit timeline heading', async ({ page }) => {
    await page.goto('/tenants/test-id/audit');
    await expect(page.getByRole('heading', { name: 'Audit Timeline' })).toBeVisible();
  });

  test('should describe immutable and read-only nature', async ({ page }) => {
    await page.goto('/tenants/test-id/audit');
    await expect(page.getByText(/immutable, append-only audit log/)).toBeVisible();
    await expect(page.getByText(/read-only/i)).toBeVisible();
  });

  test('should describe sensitive values redaction', async ({ page }) => {
    await page.goto('/tenants/test-id/audit');
    await expect(page.getByText(/Sensitive values are redacted/)).toBeVisible();
  });

  test('should show empty state when no audit records', async ({ page }) => {
    await page.goto('/tenants/test-id/audit');
    await expect(page.getByText(/Audit timeline will display/)).toBeVisible();
  });

  test('should have breadcrumb to tenant', async ({ page }) => {
    await page.goto('/tenants/test-id/audit');
    await expect(page.getByRole('link', { name: '← Tenant' })).toBeVisible();
  });
});
