/**
 * Platform domain errors — stable error codes per golden-path-errors.md.
 */

export class TenantNotFoundError extends Error {
  public readonly code = 'RESOURCE_NOT_FOUND' as const;
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

export class InvalidStateTransitionError extends Error {
  public readonly code = 'INVALID_STATE_TRANSITION' as const;
  public readonly from: string;
  public readonly to: string;

  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

export class TenantInactiveError extends Error {
  public readonly code = 'TENANT_INACTIVE' as const;
  constructor(tenantId: string, status: string) {
    super(`Tenant ${tenantId} is ${status} and cannot perform this operation`);
    this.name = 'TenantInactiveError';
  }
}

export class VersionConflictError extends Error {
  public readonly code = 'VERSION_CONFLICT' as const;
  constructor(entity: string, id: string) {
    super(`Version conflict on ${entity} ${id} — refresh and retry`);
    this.name = 'VersionConflictError';
  }
}

export class EntitlementRequiredError extends Error {
  public readonly code = 'ENTITLEMENT_REQUIRED' as const;
  public readonly moduleKey: string;

  constructor(moduleKey: string) {
    super(`Tenant does not have entitlement for module: ${moduleKey}`);
    this.name = 'EntitlementRequiredError';
    this.moduleKey = moduleKey;
  }
}

export class InvalidFeatureValueError extends Error {
  public readonly code = 'BAD_REQUEST' as const;
  public readonly featureKey: string;

  constructor(featureKey: string) {
    super(`Invalid value for feature: ${featureKey}`);
    this.name = 'InvalidFeatureValueError';
    this.featureKey = featureKey;
  }
}
