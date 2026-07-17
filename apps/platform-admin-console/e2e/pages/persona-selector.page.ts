import type { Page } from '@playwright/test';

/**
 * Page object for the demo persona selector screen.
 */
export class PersonaSelectorPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async isVisible() {
    return this.page
      .getByRole('heading', { name: 'CareCareer Platform Admin Console' })
      .isVisible();
  }

  async selectPersona(label: string) {
    await this.page.getByRole('button', { name: label }).click();
  }

  async waitForDashboard() {
    await this.page.waitForSelector('text=Platform Dashboard');
  }
}
