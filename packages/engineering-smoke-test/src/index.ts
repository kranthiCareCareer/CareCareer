/**
 * Engineering smoke-test package.
 *
 * This package exists solely to validate the CI pipeline:
 * - TypeScript strict compilation
 * - ESLint rules enforcement
 * - Vitest execution
 * - Turborepo build orchestration
 *
 * It produces no deployable service.
 */

/** Demonstrates strict TypeScript compilation */
export function add(a: number, b: number): number {
  return a + b;
}

/** Demonstrates noUncheckedIndexedAccess */
export function getFirst(items: readonly string[]): string | undefined {
  return items[0];
}

/** Demonstrates useUnknownInCatchVariables */
export function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/** Result type demonstrating discriminated unions */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
