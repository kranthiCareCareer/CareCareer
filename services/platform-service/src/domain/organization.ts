import { v7 as uuidv7 } from 'uuid';

/**
 * Organization within a tenant.
 * Represents a legal or operational grouping.
 */
export interface Organization {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

/**
 * Branch within an organization.
 */
export interface Branch {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly code: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}

export function createOrganization(params: {
  tenantId: string;
  name: string;
  createdBy: string;
}): Organization {
  const now = new Date();
  return {
    id: uuidv7(),
    tenantId: params.tenantId,
    name: params.name,
    version: 1,
    createdAt: now,
    createdBy: params.createdBy,
    updatedAt: now,
    updatedBy: params.createdBy,
  };
}

export function createBranch(params: {
  tenantId: string;
  organizationId: string;
  name: string;
  code: string;
  createdBy: string;
}): Branch {
  const now = new Date();
  return {
    id: uuidv7(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    name: params.name,
    code: params.code,
    version: 1,
    createdAt: now,
    createdBy: params.createdBy,
    updatedAt: now,
    updatedBy: params.createdBy,
  };
}
