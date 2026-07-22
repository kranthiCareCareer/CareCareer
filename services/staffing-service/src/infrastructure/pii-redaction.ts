import { Redactor } from '@carecareer/observability';

/**
 * Worker PII fields that MUST be redacted from all logs, audit payloads,
 * outbox payloads, exception messages, and tracing attributes.
 *
 * Classification:
 * - CONFIDENTIAL: firstName, lastName, email, phone
 * - RESTRICTED: home address, coordinates (location tracking risk)
 * - INTERNAL: externalId (identity mapping, not for display)
 */
export const WORKER_PII_FIELDS: readonly string[] = [
  // Names
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'fullname',
  'full_name',
  // Contact
  'email',
  'phone',
  'phonenumber',
  'phone_number',
  // Location (restricted)
  'homelatitude',
  'home_latitude',
  'homelongitude',
  'home_longitude',
  'homeaddress',
  'home_address',
  'addressline1',
  'address_line1',
  'addressline2',
  'address_line2',
  // External identity
  'externalid',
  'external_id',
];

/**
 * Staffing-service PII redactor.
 * Combines the platform default redaction paths with worker-specific PII fields.
 */
export const staffingRedactor = new Redactor([
  ...WORKER_PII_FIELDS,
  // Platform defaults (secrets, tokens, etc.) are inherited
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'ssn',
]);
