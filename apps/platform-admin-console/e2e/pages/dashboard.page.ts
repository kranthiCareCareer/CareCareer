import type { Page } from '@playwright/test';

/**
 * Page object for the platform dashboard screen.
 */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async isVisible() {
    return this.page.getByRole('heading', { name: 'Platform Dashboard' }).isVisible();
  }

  async getSignedInAs() {
    return this.page.locator('.dashboard__persona strong').textContent();
  }

  async clickSwitchPersona() {
    await this.page.getByRole('button', { name: 'Switch Persona' }).click();
  }

  async navigateToTenants() {
    await this.page.getByRole('link', { name: 'Tenants' }).click();
  }
}
