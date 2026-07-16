/**
 * Authentication and authorization type definitions.
 * Used by identity-service and consumed by all services for JWT validation.
 */

/** User roles available in the platform */
export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'TENANT_OWNER'
  | 'TENANT_ADMIN'
  | 'RECRUITER'
  | 'SENIOR_RECRUITER'
  | 'ACCOUNT_MANAGER'
  | 'SCHEDULING_COORDINATOR'
  | 'CREDENTIALING_SPECIALIST'
  | 'PAYROLL_ADMINISTRATOR'
  | 'BILLING_SPECIALIST'
  | 'COMPLIANCE_OFFICER'
  | 'BRANCH_MANAGER'
  | 'REGIONAL_DIRECTOR'
  | 'CLIENT_ADMIN'
  | 'HIRING_MANAGER'
  | 'NURSE_MANAGER'
  | 'TIMECARD_APPROVER'
  | 'CLIENT_VIEWER'
  | 'WORKER'
  | 'SUPPLIER_ADMIN'
  | 'SUPPLIER_RECRUITER';

/** Permission action types */
export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export';

/** Permission resource types */
export type PermissionResource =
  | 'jobs'
  | 'candidates'
  | 'workers'
  | 'shifts'
  | 'timecards'
  | 'credentials'
  | 'payroll'
  | 'billing'
  | 'reports'
  | 'settings'
  | 'users'
  | 'tenants';

/** A permission string in format "resource:action" */
export type Permission = `${PermissionResource}:${PermissionAction}`;

/** JWT payload structure — decoded from access token */
export interface JwtPayload {
  /** Subject — user ID */
  sub: string;
  /** Tenant ID — primary isolation key */
  tenantId: string;
  /** Assigned roles */
  roles: UserRole[];
  /** Resolved permissions from roles */
  permissions: Permission[];
  /** Branch IDs the user has access to */
  branchIds: string[];
  /** Token issued at (Unix timestamp) */
  iat: number;
  /** Token expires at (Unix timestamp) */
  exp: number;
}

/** Token pair returned after authentication */
export interface TokenPair {
  /** Short-lived access token (15 min) */
  accessToken: string;
  /** Long-lived refresh token (7 days) */
  refreshToken: string;
  /** Access token expiry (Unix timestamp) */
  expiresAt: number;
}
