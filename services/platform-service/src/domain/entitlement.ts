/**
 * Available platform modules that can be entitled to a tenant.
 */
export type ModuleKey =
  | 'core'
  | 'workforce'
  | 'credentialing'
  | 'scheduling'
  | 'timekeeping'
  | 'pay_bill_preview'
  | 'recruiting'
  | 'engagement'
  | 'vms'
  | 'analytics';

/**
 * Entitlement set for a tenant.
 * Controls which modules the tenant is allowed to use.
 */
export interface EntitlementSet {
  readonly tenantId: string;
  readonly modules: Record<ModuleKey, boolean>;
  readonly version: number;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

/**
 * Default entitlements for a newly provisioned tenant.
 * Only core is enabled by default.
 */
export function createDefaultEntitlements(tenantId: string, createdBy: string): EntitlementSet {
  return {
    tenantId,
    modules: {
      core: true,
      workforce: false,
      credentialing: false,
      scheduling: false,
      timekeeping: false,
      pay_bill_preview: false,
      recruiting: false,
      engagement: false,
      vms: false,
      analytics: false,
    },
    version: 1,
    updatedAt: new Date(),
    updatedBy: createdBy,
  };
}

/**
 * Check if a tenant has an entitlement for a specific module.
 * Fail-closed: returns false if module key is unknown.
 */
export function isEntitled(entitlements: EntitlementSet, moduleKey: string): boolean {
  if (!(moduleKey in entitlements.modules)) return false;
  return entitlements.modules[moduleKey as ModuleKey] === true;
}
