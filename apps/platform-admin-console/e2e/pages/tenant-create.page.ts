import type { Page } from '@playwright/test';

/**
 * Page object for the create tenant form.
 */
export class TenantCreatePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/tenants/create');
  }

  async fillForm(data: { name: string; slug: string; organizationName: string }) {
    await this.page.getByLabel('Tenant Name').fill(data.name);
    await this.page.getByLabel('Tenant Slug').fill(data.slug);
    await this.page.getByLabel('Initial Organization Name').fill(data.organizationName);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Provision Tenant' }).click();
  }

  async isSubmitting() {
    return this.page.getByRole('button', { name: 'Provisioning...' }).isVisible();
  }

  async getSuccessTenantId() {
    const el = this.page.locator('.success-banner code').first();
    return el.textContent();
  }

  async getErrorMessage() {
    return this.page.locator('.error-banner').textContent();
  }

  async hasSuccessBanner() {
    return this.page.locator('.success-banner').isVisible();
  }
}
