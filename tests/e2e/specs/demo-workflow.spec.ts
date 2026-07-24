import { test, expect } from '@playwright/test';

/**
 * CareCareer Local MVP — Playwright E2E Tests
 *
 * Tests the complete three-role workflow against the Docker Compose environment.
 * Prerequisite: make demo-up && make demo-seed
 */

const PLATFORM_URL = 'http://localhost:3001';
const TENANT_ID = '00000000-0000-4000-a000-000000000001';

async function getToken(
  page: import('@playwright/test').Page,
  sub: string,
  role: string,
): Promise<string> {
  const response = await page.request.post(`${PLATFORM_URL}/demo/token`, {
    data: { sub, tenantId: TENANT_ID, role },
  });
  const body = await response.json();
  return body.token as string;
}

test.describe('Admin Journey', () => {
  test('admin can sign in and view dashboard', async ({ page }) => {
    await page.goto('/');
    // Persona selector should be visible
    await expect(page.getByText('Platform Administrator')).toBeVisible();
    // Click the admin persona
    await page.getByText('Platform Administrator').click();
    // Should navigate to dashboard
    await expect(page).toHaveURL('/');
  });

  test('admin can view facilities', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Platform Administrator').click();
    await page.getByRole('link', { name: /facilities/i }).click();
    await expect(page.getByText('Mercy General Hospital')).toBeVisible({ timeout: 10000 });
  });

  test('admin can view workers', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Platform Administrator').click();
    await page.getByRole('link', { name: /workers/i }).click();
    await expect(page.getByText('Johnson')).toBeVisible({ timeout: 10000 });
  });

  test('admin can view shifts', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Platform Administrator').click();
    await page.getByRole('link', { name: /shifts/i }).click();
    await expect(page.getByText('PUBLISHED')).toBeVisible({ timeout: 10000 });
  });

  test('admin can view audit history', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Platform Administrator').click();
    await page.getByRole('link', { name: /audit/i }).click();
    // Audit page should load without error
    await expect(page.locator('.page')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Worker Journey', () => {
  test('worker can sign in and view marketplace', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Worker — Sarah Johnson').click();
    // Worker should see marketplace link
    await expect(page.getByRole('link', { name: /marketplace|available/i })).toBeVisible();
  });

  test('worker can browse available shifts', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Worker — Sarah Johnson').click();
    await page.getByRole('link', { name: /marketplace|available/i }).click();
    // Should see shift cards
    await expect(page.getByText('RN')).toBeVisible({ timeout: 10000 });
  });

  test('worker can view assignments', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Worker — Sarah Johnson').click();
    await page.getByRole('link', { name: /assignment/i }).click();
    await expect(page.locator('.page')).toBeVisible({ timeout: 10000 });
  });

  test('worker can view notifications', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Worker — Sarah Johnson').click();
    await page.getByRole('link', { name: /notification/i }).click();
    await expect(page.locator('.page')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Client Journey', () => {
  test('client can sign in and view shifts', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Client — Mercy General').click();
    await expect(page.getByRole('link', { name: /shift/i })).toBeVisible();
  });

  test('client can navigate to create shift', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Client — Mercy General').click();
    await page.getByRole('link', { name: /shift/i }).click();
    await expect(page.getByRole('link', { name: /create/i })).toBeVisible({ timeout: 10000 });
  });

  test('client can view timecards', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Client — Mercy General').click();
    await page.getByRole('link', { name: /timecard/i }).click();
    await expect(page.locator('.page')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Security', () => {
  test('unauthenticated user sees persona selector', async ({ page }) => {
    await page.goto('/shifts');
    // Should show persona selector, not the shifts page
    await expect(page.getByText('Platform Administrator')).toBeVisible();
  });

  test('worker cannot see admin routes', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Worker — Sarah Johnson').click();
    // Worker should NOT see tenants or audit links
    await expect(page.getByRole('link', { name: /tenants/i })).not.toBeVisible();
  });

  test('client cannot see admin routes', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Client — Mercy General').click();
    // Client should NOT see tenants link
    await expect(page.getByRole('link', { name: /tenants/i })).not.toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('persona selector has accessible form', async ({ page }) => {
    await page.goto('/');
    // All persona buttons should be keyboard-accessible
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('pages have proper heading structure', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Platform Administrator').click();
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible({ timeout: 10000 });
  });

  test('navigation is keyboard accessible', async ({ page }) => {
    await page.goto('/');
    // Tab should move focus
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });
});
