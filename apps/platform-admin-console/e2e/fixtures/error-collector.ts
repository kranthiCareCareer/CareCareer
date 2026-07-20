import { type Page, expect } from '@playwright/test';

/**
 * Reusable browser error collection fixture for CareCareer E2E tests.
 * Captures console errors, page exceptions, failed network requests, and
 * unexpected HTTP 5xx responses. Fails tests when unexpected errors occur.
 *
 * Usage:
 *   const errors = new ErrorCollector(page);
 *   errors.start();
 *   // ... test actions ...
 *   errors.expectNoUnexpectedErrors();
 *
 * Expected errors can be registered before the action:
 *   errors.expectError('Failed to fetch');
 *   errors.expect5xx('/api/v1/slow-endpoint');
 */

export class ErrorCollector {
  private readonly page: Page;
  private consoleErrors: string[] = [];
  private pageErrors: string[] = [];
  private failedRequests: string[] = [];
  private serverErrors: string[] = [];
  private expectedPatterns: RegExp[] = [];
  private expected5xxPaths: string[] = [];

  constructor(page: Page) {
    this.page = page;
  }

  /** Start collecting errors. Call at the beginning of a test. */
  start(): void {
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.serverErrors = [];

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Redact tokens from console output
        const sanitized = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]');
        this.consoleErrors.push(sanitized);
      }
    });

    this.page.on('pageerror', (error) => {
      this.pageErrors.push(error.message);
    });

    this.page.on('requestfailed', (request) => {
      const url = request.url();
      this.failedRequests.push(`${request.failure()?.errorText ?? 'unknown'}: ${url}`);
    });

    this.page.on('response', (response) => {
      const status = response.status();
      if (status >= 500 && status <= 599) {
        this.serverErrors.push(`${status}: ${response.url()}`);
      }
    });
  }

  /** Register an expected error pattern that should not fail the test */
  expectError(pattern: string | RegExp): void {
    this.expectedPatterns.push(typeof pattern === 'string' ? new RegExp(pattern) : pattern);
  }

  /** Register an expected 5xx path */
  expect5xx(pathPattern: string): void {
    this.expected5xxPaths.push(pathPattern);
  }

  /** Assert no unexpected errors occurred. Call at the end of a test. */
  expectNoUnexpectedErrors(): void {
    const unexpectedConsole = this.consoleErrors.filter(
      (err) => !this.expectedPatterns.some((p) => p.test(err)),
    );
    const unexpectedPage = this.pageErrors.filter(
      (err) => !this.expectedPatterns.some((p) => p.test(err)),
    );
    const unexpectedRequests = this.failedRequests.filter(
      (err) => !this.expectedPatterns.some((p) => p.test(err)),
    );
    const unexpected5xx = this.serverErrors.filter(
      (err) => !this.expected5xxPaths.some((path) => err.includes(path)),
    );

    const allUnexpected = [
      ...unexpectedConsole.map((e) => `[console.error] ${e}`),
      ...unexpectedPage.map((e) => `[pageerror] ${e}`),
      ...unexpectedRequests.map((e) => `[requestfailed] ${e}`),
      ...unexpected5xx.map((e) => `[5xx] ${e}`),
    ];

    if (allUnexpected.length > 0) {
      expect
        .soft(allUnexpected, `Unexpected browser/network errors:\n  ${allUnexpected.join('\n  ')}`)
        .toHaveLength(0);
    }
  }

  /** Get raw collected errors for debugging */
  getCollected(): {
    consoleErrors: string[];
    pageErrors: string[];
    failedRequests: string[];
    serverErrors: string[];
  } {
    return {
      consoleErrors: [...this.consoleErrors],
      pageErrors: [...this.pageErrors],
      failedRequests: [...this.failedRequests],
      serverErrors: [...this.serverErrors],
    };
  }
}
