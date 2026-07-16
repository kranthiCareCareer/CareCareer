import { v7 as uuidv7 } from 'uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CORRELATION_ID_LENGTH = 128;

/**
 * Validate a caller-supplied correlation ID.
 * Never trust caller-supplied identifiers without format and length validation.
 *
 * @returns The validated ID if valid, or undefined if invalid
 */
export function validateCorrelationId(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (value.length > MAX_CORRELATION_ID_LENGTH) return undefined;
  if (UUID_REGEX.test(value)) return value;
  // Allow non-UUID formats if they're reasonable length and printable ASCII
  if (/^[\x20-\x7E]+$/.test(value)) return value;
  return undefined;
}

/**
 * Generate a new request ID using UUID v7 (time-ordered).
 */
export function generateRequestId(): string {
  return uuidv7();
}

/**
 * Generate a new correlation ID using UUID v7.
 * Used when the caller does not provide one.
 */
export function generateCorrelationId(): string {
  return uuidv7();
}
