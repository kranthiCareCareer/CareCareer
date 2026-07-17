import type { Page } from '@playwright/test';

/**
 * Page object for the tenant detail/overview screen.
 */
export class TenantDetailPage {
  constructor(private readonly page: Page) {}

  async goto(tenantId: string) {
    await this.page.goto(`/tenants/${tenantId}`);
  }

  async isVisible() {
    return this.page.locator('.tenant-detail').isVisible();
  }

  async getStatus() {
    return this.page.locator('.badge').textContent();
  }

  async getVersion() {
    const dd = this.page.locator('.dl dd').nth(2);
    return dd.textContent();
  }

  async clickActivate() {
    await this.page.getByRole('button', { name: 'Activate' }).click();
  }

  async clickSuspend() {
    await this.page.getByRole('button', { name: 'Suspend' }).click();
  }

  async clickReactivate() {
    await this.page.getByRole('button', { name: 'Reactivate' }).click();
  }

  async clickDeactivate() {
    await this.page.getByRole('button', { name: 'Deactivate' }).click();
  }

  async navigateToOrganizations() {
    await this.page.getByRole('link', { name: 'Manage' }).first().click();
  }

  async navigateToEntitlements() {
    await this.page.getByRole('link', { name: 'Manage' }).nth(1).click();
  }
}
