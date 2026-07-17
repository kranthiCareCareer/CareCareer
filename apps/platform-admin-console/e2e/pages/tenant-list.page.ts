import type { Page } from '@playwright/test';

/**
 * Page object for the tenant list screen.
 */
export class TenantListPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/tenants');
  }

  async isVisible() {
    return this.page.getByRole('heading', { name: 'Tenants' }).isVisible();
  }

  async searchTenants(query: string) {
    await this.page.getByRole('searchbox', { name: 'Search tenants' }).fill(query);
  }

  async filterByStatus(status: string) {
    await this.page.getByRole('combobox', { name: 'Filter by status' }).selectOption(status);
  }

  async clickCreateTenant() {
    await this.page.getByRole('link', { name: 'Create Tenant' }).click();
  }

  async getTenantCount() {
    return this.page.locator('.tenant-list__empty, .tenant-list__table tr').count();
  }
}
