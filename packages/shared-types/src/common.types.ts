/**
 * Common utility types used across the platform.
 */

/** Standard paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    /** Current page cursor (opaque string) */
    cursor: string | null;
    /** Next page cursor (null if last page) */
    nextCursor: string | null;
    /** Whether there are more results */
    hasMore: boolean;
    /** Total count (only included when explicitly requested) */
    totalCount?: number;
  };
}

/** Standard pagination input */
export interface PaginationInput {
  /** Cursor for cursor-based pagination */
  cursor?: string;
  /** Page size (default: 25, max: 100) */
  limit?: number;
}

/** Standard error response envelope */
export interface ErrorResponse {
  /** Machine-readable error code */
  errorCode: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Request correlation ID for support reference */
  correlationId: string;
  /** Timestamp of the error */
  timestamp: string;
}

/** Standard API success response */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    correlationId: string;
    timestamp: string;
  };
}

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Generic sort input */
export interface SortInput {
  field: string;
  direction: SortDirection;
}

/** Idempotency key for mutation requests */
export type IdempotencyKey = string;

/** Health check response */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  dependencies: Record<string, { status: 'up' | 'down'; latencyMs?: number }>;
}
