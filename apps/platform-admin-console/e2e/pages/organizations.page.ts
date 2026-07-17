import type { Page } from '@playwright/test';

/**
 * Page object for the organizations screen.
 */
export class OrganizationsPage {
  constructor(private readonly page: Page) {}

  async goto(tenantId: string) {
    await this.page.goto(`/tenants/${tenantId}/organizations`);
  }

  async isVisible() {
    return this.page.getByRole('heading', { name: 'Organizations' }).isVisible();
  }

  async createOrganization(name: string) {
    await this.page.getByLabel('Organization name').fill(name);
    await this.page.getByRole('button', { name: 'Create Organization' }).click();
  }

  async getOrganizationNames() {
    return this.page.locator('.list-item strong').allTextContents();
  }

  async getEmptyState() {
    return this.page.locator('.empty-state').textContent();
  }

  async getError() {
    return this.page.locator('.error-banner').textContent();
  }
}
