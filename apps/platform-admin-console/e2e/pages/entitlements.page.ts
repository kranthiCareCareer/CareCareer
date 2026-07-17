import type { Page } from '@playwright/test';

/**
 * Page object for the entitlements management screen.
 */
export class EntitlementsPage {
  constructor(private readonly page: Page) {}

  async goto(tenantId: string) {
    await this.page.goto(`/tenants/${tenantId}/entitlements`);
  }

  async isVisible() {
    return this.page.getByRole('heading', { name: 'Entitlements' }).isVisible();
  }

  async toggleModule(label: string) {
    await this.page.getByText(label).locator('..').getByRole('checkbox').click();
  }

  async isModuleEnabled(label: string) {
    const checkbox = this.page.getByText(label).locator('..').getByRole('checkbox');
    return checkbox.isChecked();
  }

  async getVersion() {
    const meta = this.page.locator('.meta');
    return meta.textContent();
  }

  async getError() {
    return this.page.locator('.error-banner').textContent();
  }
}
