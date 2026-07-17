import { v7 as uuidv7 } from 'uuid';

/**
 * Tenant lifecycle states.
 * DEACTIVATED is terminal — cannot be reactivated.
 */
export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/**
 * Tenant aggregate root.
 */
export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: TenantStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

/**
 * Allowed tenant state transitions.
 */
const ALLOWED_TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  PROVISIONING: ['ACTIVE'],
  ACTIVE: ['SUSPENDED', 'DEACTIVATED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: [],
};

/**
 * Validates a tenant lifecycle transition.
 * Returns true if the transition is allowed.
 */
export function isValidTransition(from: TenantStatus, to: TenantStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Create a new tenant in PROVISIONING state.
 */
export function createTenant(params: {
  name: string;
  slug: string;
  createdBy: string;
}): Tenant {
  const now = new Date();
  return {
    id: uuidv7(),
    name: params.name,
    slug: params.slug,
    status: 'PROVISIONING',
    version: 1,
    createdAt: now,
    createdBy: params.createdBy,
    updatedAt: now,
    updatedBy: params.createdBy,
  };
}
