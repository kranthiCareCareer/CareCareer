import type { Page } from '@playwright/test';

/**
 * Page object for the feature configuration screen.
 */
export class FeaturesPage {
  constructor(private readonly page: Page) {}

  async goto(tenantId: string) {
    await this.page.goto(`/tenants/${tenantId}/features`);
  }

  async isVisible() {
    return this.page.getByRole('heading', { name: 'Feature Configuration' }).isVisible();
  }

  async toggleBooleanFeature(label: string) {
    await this.page.getByText(label).locator('..').getByRole('checkbox').click();
  }

  async setNumberFeature(label: string, value: number) {
    const input = this.page.getByText(label).locator('..').getByRole('spinbutton');
    await input.fill(String(value));
    await input.press('Tab');
  }

  async getError() {
    return this.page.locator('.error-banner').textContent();
  }
}
