import { createHash } from 'node:crypto';

/**
 * Fields that MUST be excluded from request hashing.
 * These contain sensitive data or non-deterministic values.
 */
const EXCLUDED_FIELDS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-correlation-id',
  'x-request-id',
  'idempotency-key',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'ssn',
  'bankaccount',
  'routingnumber',
  'creditcard',
]);

/**
 * Produces a normalized hash of the request payload for idempotency comparison.
 * Excludes sensitive fields and headers that should not affect idempotency.
 */
export class RequestHasher {
  /**
   * Hash a request body, excluding sensitive fields.
   * Returns a deterministic SHA-256 hex string.
   */
  static hash(body: unknown): string {
    const normalized = RequestHasher.normalize(body);
    const serialized = JSON.stringify(normalized);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Recursively normalize an object, removing excluded fields.
   */
  private static normalize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => RequestHasher.normalize(item));
    }
    if (typeof value === 'object') {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(value as Record<string, unknown>).sort();
      for (const key of keys) {
        if (!EXCLUDED_FIELDS.has(key.toLowerCase())) {
          sorted[key] = RequestHasher.normalize((value as Record<string, unknown>)[key]);
        }
      }
      return sorted;
    }
    return null;
  }
}
