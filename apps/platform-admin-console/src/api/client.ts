import type { EntitlementSet, FeatureConfiguration, Organization, Tenant } from './types';

const API_BASE = '/api/v1';

/**
 * Generate a cryptographically secure UUID v4.
 * Uses crypto.randomUUID when available, falls back to crypto.getRandomValues.
 */
function secureUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback using crypto.getRandomValues (available in all modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version 4 bits
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    // Set variant bits
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort (should not reach here in any browser or Node 16+)
  throw new Error('No cryptographic random source available');
}

/**
 * Typed API client for CareCareer platform-service.
 * All mutations include idempotency keys and correlation IDs.
 */
class PlatformApiClient {
  private token: string | null = null;
  private actorId: string | null = null;

  setAuth(token: string, actorId: string): void {
    this.token = token;
    this.actorId = actorId;
  }

  clearAuth(): void {
    this.token = null;
    this.actorId = null;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    if (this.actorId) h['X-Actor-Id'] = this.actorId;
    h['X-Correlation-Id'] = secureUUID();
    return h;
  }

  private idempotencyKey(): string {
    return secureUUID();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<{ data: T; correlationId: string; status: number }> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...this.headers(options.headers as Record<string, string>),
      },
    });

    const correlationId = res.headers.get('x-correlation-id') ?? 'unknown';

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = new Error(body.message ?? `HTTP ${res.status}`) as Error & {
        status: number;
        code?: string;
        correlationId: string;
      };
      error.status = res.status;
      error.code = body.code;
      error.correlationId = correlationId;
      throw error;
    }

    const data = (await res.json()) as T;
    return { data, correlationId, status: res.status };
  }

  // ─── Tenants ───

  async provisionTenant(input: {
    name: string;
    slug: string;
    organizationName: string;
  }): Promise<{ tenantId: string; organizationId: string; correlationId: string }> {
    const { data, correlationId } = await this.request<{
      data: { tenantId: string; organizationId: string };
    }>('/tenants', {
      method: 'POST',
      headers: { 'Idempotency-Key': this.idempotencyKey() },
      body: JSON.stringify(input),
    });
    return { ...data.data, correlationId };
  }

  async getTenant(tenantId: string): Promise<Tenant> {
    const { data } = await this.request<{ data: Tenant }>(`/tenants/${tenantId}`);
    return data.data;
  }

  // ─── Lifecycle ───

  async activateTenant(
    tenantId: string,
    reason: string,
    version: number,
  ): Promise<{ status: string }> {
    const { data } = await this.request<{ status: string }>(`/tenants/${tenantId}/activate`, {
      method: 'POST',
      headers: { 'Idempotency-Key': this.idempotencyKey() },
      body: JSON.stringify({ reason, version }),
    });
    return data;
  }

  async suspendTenant(
    tenantId: string,
    reason: string,
    version: number,
  ): Promise<{ status: string }> {
    const { data } = await this.request<{ status: string }>(`/tenants/${tenantId}/suspend`, {
      method: 'POST',
      headers: { 'Idempotency-Key': this.idempotencyKey() },
      body: JSON.stringify({ reason, version }),
    });
    return data;
  }

  async deactivateTenant(
    tenantId: string,
    reason: string,
    version: number,
  ): Promise<{ status: string }> {
    const { data } = await this.request<{ status: string }>(`/tenants/${tenantId}/deactivate`, {
      method: 'POST',
      headers: { 'Idempotency-Key': this.idempotencyKey() },
      body: JSON.stringify({ reason, version }),
    });
    return data;
  }

  // ─── Organizations ───

  async listOrganizations(tenantId: string): Promise<Organization[]> {
    const { data } = await this.request<{ data: Organization[] }>(
      `/tenants/${tenantId}/organizations`,
    );
    return data.data;
  }

  async createOrganization(tenantId: string, name: string): Promise<{ organizationId: string }> {
    const { data } = await this.request<{
      data: { organizationId: string };
    }>(`/tenants/${tenantId}/organizations`, {
      method: 'POST',
      headers: { 'Idempotency-Key': this.idempotencyKey() },
      body: JSON.stringify({ name }),
    });
    return data.data;
  }

  // ─── Entitlements ───

  async getEntitlements(tenantId: string): Promise<EntitlementSet> {
    const { data } = await this.request<{ data: EntitlementSet }>(
      `/tenants/${tenantId}/entitlements`,
    );
    return data.data;
  }

  async updateEntitlements(
    tenantId: string,
    modules: Record<string, boolean>,
    version: number,
  ): Promise<void> {
    await this.request(`/tenants/${tenantId}/entitlements`, {
      method: 'PUT',
      body: JSON.stringify({ modules, version }),
    });
  }

  // ─── Features ───

  async getFeatures(tenantId: string): Promise<FeatureConfiguration[]> {
    const { data } = await this.request<{ data: FeatureConfiguration[] }>(
      `/tenants/${tenantId}/features`,
    );
    return data.data;
  }

  async updateFeature(tenantId: string, featureKey: string, value: unknown): Promise<void> {
    await this.request(`/tenants/${tenantId}/features/${featureKey}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }
}

/** Singleton API client */
export const apiClient = new PlatformApiClient();
