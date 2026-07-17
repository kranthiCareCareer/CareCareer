import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for CareCareer Platform Admin Console E2E tests.
 *
 * Browser: Chromium desktop (1440×900)
 * Base URL: http://localhost:4000
 * API URL: http://localhost:3001
 */
export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false, // Stateful demo flows require serial execution
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1, // Single worker for stateful demo flows
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results/',
});
