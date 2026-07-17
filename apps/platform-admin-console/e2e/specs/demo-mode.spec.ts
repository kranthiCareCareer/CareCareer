import { test, expect } from '@playwright/test';

test.describe('Demo mode availability', () => {
  test('should show persona selector when demo mode is enabled', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('DEMO MODE — Development Only')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'CareCareer Platform Admin Console' }),
    ).toBeVisible();
  });

  test('should display all four personas', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Platform Administrator/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /MAS Tenant Administrator/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /CareShield Tenant Administrator/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Read-Only Auditor/ })).toBeVisible();
  });

  test('should show production disclaimer in footer', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByText(/Production authentication uses a proper identity provider/),
    ).toBeVisible();
  });

  test('should not display any console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors (like favicon 404)
    const critical = errors.filter((e) => !e.includes('favicon') && !e.includes('404'));
    expect(critical).toHaveLength(0);
  });
});
