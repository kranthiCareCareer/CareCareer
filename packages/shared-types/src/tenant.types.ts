/**
 * Tenant-related type definitions.
 * Every entity in the system belongs to a tenant — this is the primary isolation boundary.
 */

/** Unique tenant identifier (UUID v4) */
export type TenantId = string;

/** Tenant status in the platform lifecycle */
export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/** Represents the tenant context extracted from JWT and propagated through requests */
export interface TenantContext {
  /** Tenant ID — primary isolation key */
  tenantId: TenantId;
  /** User performing the action */
  userId: string;
  /** Actor type for audit purposes */
  actorType: 'user' | 'service' | 'agent' | 'system';
  /** Request correlation ID for distributed tracing */
  correlationId: string;
  /** User's roles within this tenant */
  roles: string[];
  /** Explicit permissions resolved from roles */
  permissions: string[];
}

/** Base interface for all tenant-owned entities */
export interface TenantOwnedEntity {
  /** Primary key (UUID v4) */
  id: string;
  /** Owning tenant — enforced by RLS */
  tenantId: TenantId;
  /** When the record was created (UTC) */
  createdAt: Date;
  /** When the record was last updated (UTC) */
  updatedAt: Date;
  /** Who created this record */
  createdBy: string;
  /** Optimistic concurrency version */
  version: number;
}
