import { TenantAwareTransaction } from '@carecareer/database';

import type { EntitlementSet } from '../../domain/entitlement.js';
import type { FeatureConfiguration } from '../../domain/feature-configuration.js';
import type { Branch, Organization } from '../../domain/organization.js';
import type { Tenant } from '../../domain/tenant.js';
import type { PlatformRepository } from '../ports/platform-repository.js';

/**
 * Get a single tenant by ID.
 * Uses tenant-scoped RLS — caller can only read their own tenant.
 */
export async function getTenantQuery(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  tenantId: string,
): Promise<Tenant | undefined> {
  return tenantDb.execute(tenantId, async (tx) => {
    return repo.findTenantById(tx, tenantId);
  });
}

/**
 * List organizations for a tenant.
 */
export async function listOrganizationsQuery(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  tenantId: string,
): Promise<Organization[]> {
  return tenantDb.execute(tenantId, async (tx) => {
    return repo.findOrganizationsByTenant(tx, tenantId);
  });
}

/**
 * List branches for an organization.
 */
export async function listBranchesQuery(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  tenantId: string,
  organizationId: string,
): Promise<Branch[]> {
  return tenantDb.execute(tenantId, async (tx) => {
    return repo.findBranchesByOrganization(tx, organizationId);
  });
}

/**
 * Get entitlements for a tenant.
 */
export async function getEntitlementsQuery(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  tenantId: string,
): Promise<EntitlementSet> {
  return tenantDb.execute(tenantId, async (tx) => {
    return repo.getEntitlements(tx, tenantId);
  });
}

/**
 * Get all feature configurations for a tenant.
 */
export async function getFeatureConfigurationsQuery(
  tenantDb: TenantAwareTransaction,
  repo: PlatformRepository,
  tenantId: string,
): Promise<FeatureConfiguration[]> {
  return tenantDb.execute(tenantId, async (tx) => {
    return repo.getAllFeatures(tx, tenantId);
  });
}
