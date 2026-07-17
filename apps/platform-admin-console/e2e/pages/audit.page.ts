import type { Page } from '@playwright/test';

/**
 * Page object for the audit timeline screen.
 */
export class AuditPage {
  constructor(private readonly page: Page) {}

  async goto(tenantId: string) {
    await this.page.goto(`/tenants/${tenantId}/audit`);
  }

  async isVisible() {
    return this.page.getByRole('heading', { name: 'Audit Timeline' }).isVisible();
  }

  async hasEntries() {
    return this.page.locator('.audit-entry').count();
  }

  async getEmptyState() {
    return this.page.locator('.empty-state').textContent();
  }
}
