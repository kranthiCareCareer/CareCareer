/**
 * Configuration for tenant-aware database access.
 */
export interface TenantDatabaseConfig {
  /** Maximum transaction timeout in milliseconds */
  maxTransactionTimeout: number;
  /** Whether to enforce tenant context (should always be true in production) */
  enforceTenantContext: boolean;
}
