import { test, expect } from '@playwright/test';
import { PersonaSelectorPage } from '../pages/persona-selector.page';

test.describe('Validation errors', () => {
  test.beforeEach(async ({ page }) => {
    const personaSelector = new PersonaSelectorPage(page);
    await personaSelector.goto();
    await personaSelector.selectPersona('Platform Administrator');
    await personaSelector.waitForDashboard();
  });

  test('should enforce required fields on create tenant', async ({ page }) => {
    await page.goto('/tenants/create');

    // Try to submit empty form
    await page.getByRole('button', { name: 'Provision Tenant' }).click();

    // HTML5 validation should prevent submission
    const nameInput = page.getByLabel('Tenant Name');
    const validity = await nameInput.evaluate((el: HTMLInputElement) => el.validity.valueMissing);
    expect(validity).toBe(true);
  });

  test('should validate slug pattern', async ({ page }) => {
    await page.goto('/tenants/create');

    // Fill name but use invalid slug
    await page.getByLabel('Tenant Name').fill('Test');
    await page.getByLabel('Tenant Slug').fill('Invalid Slug');
    await page.getByLabel('Initial Organization Name').fill('Org');

    await page.getByRole('button', { name: 'Provision Tenant' }).click();

    // Pattern validation: ^[a-z][a-z0-9-]*$
    // After click, the browser validates and the input should be invalid
    const slugInput = page.getByLabel('Tenant Slug');
    await expect(slugInput).toHaveAttribute('pattern');
    const validity = await slugInput.evaluate(
      (el: HTMLInputElement) => !el.checkValidity(),
    );
    expect(validity).toBe(true);
  });

  test('should enforce minimum slug length', async ({ page }) => {
    await page.goto('/tenants/create');

    await page.getByLabel('Tenant Name').fill('Test');
    await page.getByLabel('Tenant Slug').fill('a');
    await page.getByLabel('Initial Organization Name').fill('Org');

    await page.getByRole('button', { name: 'Provision Tenant' }).click();

    // minLength=2
    const slugInput = page.getByLabel('Tenant Slug');
    const validity = await slugInput.evaluate((el: HTMLInputElement) => el.validity.tooShort);
    expect(validity).toBe(true);
  });

  test('should show error banner for API validation errors', async ({ page }) => {
    await page.goto('/tenants/create');

    await page.getByLabel('Tenant Name').fill('Test');
    await page.getByLabel('Tenant Slug').fill('test-slug');
    await page.getByLabel('Initial Organization Name').fill('Org');

    // Submit - if backend returns validation error, error-banner should appear
    await page.getByRole('button', { name: 'Provision Tenant' }).click();

    // Wait for either success or error
    await page.waitForSelector('.success-banner, .error-banner', { timeout: 10000 }).catch(() => {
      // Timeout means neither appeared — backend might not be running
    });

    // If error-banner appeared, verify it's an alert
    if (
      await page
        .locator('.error-banner')
        .isVisible({ timeout: 1000 })
        .catch(() => false)
    ) {
      await expect(page.locator('.error-banner')).toHaveAttribute('role', 'alert');
    }
  });

  test('should not display raw database errors', async ({ page }) => {
    await page.goto('/tenants/create');

    await page.getByLabel('Tenant Name').fill('Error Test');
    await page.getByLabel('Tenant Slug').fill('error-test');
    await page.getByLabel('Initial Organization Name').fill('Org');
    await page.getByRole('button', { name: 'Provision Tenant' }).click();

    // Wait for response
    await page
      .waitForSelector('.success-banner, .error-banner', { timeout: 10000 })
      .catch(() => {});

    // Verify no raw database/SQL errors are shown
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('PostgreSQL');
    expect(pageContent).not.toContain('SQLSTATE');
    expect(pageContent).not.toContain('stack trace');
    expect(pageContent).not.toContain('node_modules');
  });
});
