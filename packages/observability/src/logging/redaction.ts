/**
 * Default field names that MUST be redacted from logs.
 * Case-insensitive matching.
 */
export const DEFAULT_REDACT_PATHS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'ssn',
  'socialsecuritynumber',
  'social_security_number',
  'bankaccount',
  'bank_account',
  'routingnumber',
  'routing_number',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'documentcontents',
  'document_contents',
  'healthrecord',
  'health_record',
  'drugtest',
  'drug_test',
  'backgroundcheck',
  'background_check',
];

const REDACTED = '[REDACTED]';

/**
 * Recursively redacts sensitive fields from objects before logging.
 * Does not mutate the original — returns a new object.
 */
export class Redactor {
  private readonly redactSet: Set<string>;
  private readonly maxDepth: number;

  constructor(paths: readonly string[] = DEFAULT_REDACT_PATHS, maxDepth: number = 10) {
    this.redactSet = new Set(paths.map((p) => p.toLowerCase()));
    this.maxDepth = maxDepth;
  }

  /**
   * Redact sensitive fields from a value.
   * Returns a deep copy with sensitive fields replaced by '[REDACTED]'.
   */
  redact(value: unknown): unknown {
    return this.redactRecursive(value, 0);
  }

  private redactRecursive(value: unknown, depth: number): unknown {
    if (depth > this.maxDepth) return '[MAX_DEPTH]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactRecursive(item, depth + 1));
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (this.redactSet.has(key.toLowerCase())) {
          result[key] = REDACTED;
        } else {
          result[key] = this.redactRecursive(val, depth + 1);
        }
      }
      return result;
    }
    return value;
  }
}
