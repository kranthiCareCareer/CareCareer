import type { TransactionClient } from '@carecareer/database';

import type { EntitlementSet } from '../../domain/entitlement.js';
import type { FeatureConfiguration, FeatureKey } from '../../domain/feature-configuration.js';
import type { Branch, Organization } from '../../domain/organization.js';
import type { Tenant, TenantStatus } from '../../domain/tenant.js';

/**
 * Platform repository port.
 * All operations receive a TransactionClient (already tenant-scoped via RLS
 * or admin-scoped for bootstrapping).
 */
export interface PlatformRepository {
  // Tenant
  createTenant(tx: TransactionClient, tenant: Tenant): Promise<void>;
  findTenantById(tx: TransactionClient, tenantId: string): Promise<Tenant | undefined>;
  updateTenantStatus(
    tx: TransactionClient,
    params: {
      tenantId: string;
      status: TenantStatus;
      version: number;
      expectedVersion: number;
      updatedBy: string;
      reason: string;
    },
  ): Promise<void>;

  // Organization
  createOrganization(tx: TransactionClient, org: Organization): Promise<void>;
  findOrganizationsByTenant(tx: TransactionClient, tenantId: string): Promise<Organization[]>;

  // Branch
  createBranch(tx: TransactionClient, branch: Branch): Promise<void>;
  findBranchesByOrganization(tx: TransactionClient, organizationId: string): Promise<Branch[]>;

  // Entitlements
  saveEntitlements(tx: TransactionClient, entitlements: EntitlementSet): Promise<void>;
  getEntitlements(tx: TransactionClient, tenantId: string): Promise<EntitlementSet>;

  // Feature Configuration
  saveFeature(tx: TransactionClient, config: FeatureConfiguration): Promise<void>;
  getFeatureValue(
    tx: TransactionClient,
    tenantId: string,
    featureKey: FeatureKey,
  ): Promise<FeatureConfiguration | undefined>;
  getAllFeatures(tx: TransactionClient, tenantId: string): Promise<FeatureConfiguration[]>;
}
