import type { TransactionClient } from '@carecareer/database';

import type { PlatformRepository } from '../application/ports/platform-repository.js';
import { createDefaultEntitlements, type EntitlementSet } from '../domain/entitlement.js';
import { VersionConflictError } from '../domain/errors.js';
import type { FeatureConfiguration, FeatureKey } from '../domain/feature-configuration.js';
import type { Branch, Organization } from '../domain/organization.js';
import type { Tenant, TenantStatus } from '../domain/tenant.js';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

interface OrganizationRow {
  id: string;
  tenant_id: string;
  name: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

interface EntitlementRow {
  tenant_id: string;
  modules: Record<string, boolean>;
  version: number;
  updated_at: string;
  updated_by: string;
}

interface FeatureRow {
  tenant_id: string;
  feature_key: string;
  value: unknown;
  version: number;
  updated_at: string;
  updated_by: string;
}

/**
 * PostgreSQL implementation of PlatformRepository.
 * Uses $executeRaw for writes and $queryRaw for reads — both RLS-compatible.
 */
export class PostgresPlatformRepository implements PlatformRepository {
  async createTenant(tx: TransactionClient, tenant: Tenant): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO tenants (id, name, slug, status, version, created_at, created_by, updated_at, updated_by)
      VALUES (${tenant.id}::uuid, ${tenant.name}, ${tenant.slug}, ${tenant.status},
              ${tenant.version}, ${tenant.createdAt.toISOString()}, ${tenant.createdBy},
              ${tenant.updatedAt.toISOString()}, ${tenant.updatedBy})
    `;
  }

  async findTenantById(tx: TransactionClient, tenantId: string): Promise<Tenant | undefined> {
    const rows = await tx.$queryRaw<TenantRow>`
      SELECT id, name, slug, status, version, created_at, created_by, updated_at, updated_by
      FROM tenants WHERE id = ${tenantId}::uuid
    `;
    if (rows.length === 0) return undefined;
    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status as TenantStatus,
      version: row.version,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    };
  }

  async updateTenantStatus(
    tx: TransactionClient,
    params: {
      tenantId: string;
      status: TenantStatus;
      version: number;
      expectedVersion: number;
      updatedBy: string;
      reason: string;
    },
  ): Promise<void> {
    const rowCount = await tx.$executeRaw`
      UPDATE tenants
      SET status = ${params.status}, version = ${params.version},
          updated_at = NOW(), updated_by = ${params.updatedBy}
      WHERE id = ${params.tenantId}::uuid AND version = ${params.expectedVersion}
    `;

    if (rowCount === 0) {
      throw new VersionConflictError('tenant', params.tenantId);
    }
  }

  async createOrganization(tx: TransactionClient, org: Organization): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO organizations (id, tenant_id, name, version, created_at, created_by, updated_at, updated_by)
      VALUES (${org.id}::uuid, ${org.tenantId}::uuid, ${org.name},
              ${org.version}, ${org.createdAt.toISOString()}, ${org.createdBy},
              ${org.updatedAt.toISOString()}, ${org.updatedBy})
    `;
  }

  async findOrganizationsByTenant(
    tx: TransactionClient,
    tenantId: string,
  ): Promise<Organization[]> {
    const rows = await tx.$queryRaw<OrganizationRow>`
      SELECT id, tenant_id, name, version, created_at, created_by, updated_at, updated_by
      FROM organizations WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      version: row.version,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    }));
  }

  async createBranch(tx: TransactionClient, branch: Branch): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO branches (id, tenant_id, organization_id, name, code, version, created_at, created_by, updated_at, updated_by)
      VALUES (${branch.id}::uuid, ${branch.tenantId}::uuid, ${branch.organizationId}::uuid,
              ${branch.name}, ${branch.code}, ${branch.version},
              ${branch.createdAt.toISOString()}, ${branch.createdBy},
              ${branch.updatedAt.toISOString()}, ${branch.updatedBy})
    `;
  }

  async findBranchesByOrganization(
    tx: TransactionClient,
    organizationId: string,
  ): Promise<Branch[]> {
    const rows = await tx.$queryRaw<{
      id: string;
      tenant_id: string;
      organization_id: string;
      name: string;
      code: string;
      version: number;
      created_at: string;
      created_by: string;
      updated_at: string;
      updated_by: string;
    }>`
      SELECT id, tenant_id, organization_id, name, code, version, created_at, created_by, updated_at, updated_by
      FROM branches WHERE organization_id = ${organizationId}::uuid
      ORDER BY created_at ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      organizationId: row.organization_id,
      name: row.name,
      code: row.code,
      version: row.version,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    }));
  }

  async saveEntitlements(tx: TransactionClient, entitlements: EntitlementSet): Promise<void> {
    const modulesJson = JSON.stringify(entitlements.modules);
    await tx.$executeRaw`
      INSERT INTO tenant_entitlements (tenant_id, modules, version, updated_at, updated_by)
      VALUES (${entitlements.tenantId}::uuid, ${modulesJson}::jsonb,
              ${entitlements.version}, ${entitlements.updatedAt.toISOString()}, ${entitlements.updatedBy})
      ON CONFLICT (tenant_id) DO UPDATE SET
        modules = ${modulesJson}::jsonb,
        version = ${entitlements.version},
        updated_at = ${entitlements.updatedAt.toISOString()},
        updated_by = ${entitlements.updatedBy}
    `;
  }

  async getEntitlements(tx: TransactionClient, tenantId: string): Promise<EntitlementSet> {
    const rows = await tx.$queryRaw<EntitlementRow>`
      SELECT tenant_id, modules, version, updated_at, updated_by
      FROM tenant_entitlements WHERE tenant_id = ${tenantId}::uuid
    `;
    if (rows.length === 0) {
      return createDefaultEntitlements(tenantId, 'system');
    }
    const row = rows[0]!;
    return {
      tenantId: row.tenant_id,
      modules: row.modules as EntitlementSet['modules'],
      version: row.version,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    };
  }

  async saveFeature(tx: TransactionClient, config: FeatureConfiguration): Promise<void> {
    const valueJson = JSON.stringify(config.value);
    await tx.$executeRaw`
      INSERT INTO tenant_feature_configurations (tenant_id, feature_key, value, version, updated_at, updated_by)
      VALUES (${config.tenantId}::uuid, ${config.featureKey}, ${valueJson}::jsonb,
              ${config.version}, ${config.updatedAt.toISOString()}, ${config.updatedBy})
      ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
        value = ${valueJson}::jsonb,
        version = ${config.version},
        updated_at = ${config.updatedAt.toISOString()},
        updated_by = ${config.updatedBy}
    `;
  }

  async getFeatureValue(
    tx: TransactionClient,
    tenantId: string,
    featureKey: FeatureKey,
  ): Promise<FeatureConfiguration | undefined> {
    const rows = await tx.$queryRaw<FeatureRow>`
      SELECT tenant_id, feature_key, value, version, updated_at, updated_by
      FROM tenant_feature_configurations
      WHERE tenant_id = ${tenantId}::uuid AND feature_key = ${featureKey}
    `;
    if (rows.length === 0) return undefined;
    const row = rows[0]!;
    return {
      tenantId: row.tenant_id,
      featureKey: row.feature_key as FeatureKey,
      value: row.value,
      version: row.version,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    };
  }

  async getAllFeatures(tx: TransactionClient, tenantId: string): Promise<FeatureConfiguration[]> {
    const rows = await tx.$queryRaw<FeatureRow>`
      SELECT tenant_id, feature_key, value, version, updated_at, updated_by
      FROM tenant_feature_configurations
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY feature_key ASC
    `;
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      featureKey: row.feature_key as FeatureKey,
      value: row.value,
      version: row.version,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    }));
  }
}
