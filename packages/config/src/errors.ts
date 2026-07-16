import type { ZodIssue } from 'zod';

/**
 * Thrown when application configuration fails validation.
 * Should cause the process to exit immediately.
 */
export class ConfigValidationError extends Error {
  public readonly issues: ZodIssue[];

  constructor(message: string, issues: ZodIssue[]) {
    super(message);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}
