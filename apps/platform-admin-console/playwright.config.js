// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for CareCareer Platform Admin Console.
 *
 * Projects:
 *   chromium-pr         — Pull request gate (Chromium desktop)
 *   chromium-regression — Full regression on main branch
 *   firefox-nightly     — Firefox cross-browser (nightly)
 *   webkit-nightly      — WebKit cross-browser (nightly)
 *   mobile-chrome-web   — Responsive mobile Chrome emulation (nightly)
 *   mobile-safari-web   — Responsive mobile Safari emulation (nightly)
 *   chrome-release      — Chrome stable release validation
 *   edge-release        — Edge stable release validation
 *
 * Base URL: http://localhost:4000
 * API URL: http://localhost:3001
 */
export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env['CI'] ? [['junit', { outputFile: 'test-results/junit.xml' }]] : []),
  ],
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    // ─── Default (backward compatible with demo:verify) ───────────────────────
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // ─── Pull Request ─────────────────────────────────────────────────────────
    {
      name: 'chromium-pr',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grep: [/@smoke/, /@navigation/, /@accessibility/, /@isolation/],
    },
    // ─── Nightly Cross-Browser ────────────────────────────────────────────────
    {
      name: 'firefox-nightly',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-nightly',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    // ─── Responsive Web ───────────────────────────────────────────────────────
    {
      name: 'mobile-chrome-web',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari-web',
      use: { ...devices['iPhone 13'] },
    },
    // ─── Release Validation ───────────────────────────────────────────────────
    {
      name: 'chrome-release',
      use: {
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'edge-release',
      use: {
        channel: 'msedge',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  outputDir: 'test-results/',
});
