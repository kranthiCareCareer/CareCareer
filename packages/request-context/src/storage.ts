import { AsyncLocalStorage } from 'node:async_hooks';

import { RequestContext, type RequestContextData } from './request-context.js';

/**
 * AsyncLocalStorage instance for request context propagation.
 * Automatically propagates through async operations without explicit passing.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Execute a function within a request context.
 * Context is automatically available in all downstream async operations.
 */
export function runWithContext<T>(data: RequestContextData, fn: () => T): T {
  const context = new RequestContext(data);
  return requestContextStorage.run(context, fn);
}

/**
 * Get the current request context.
 * Returns undefined if called outside a request context (e.g., during startup).
 */
export function getContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current request context or throw.
 * Use when context is mandatory (inside request handlers).
 */
export function requireContext(): RequestContext {
  const context = getContext();
  if (!context) {
    throw new Error(
      'Request context is not available. Ensure this code runs within a request lifecycle.',
    );
  }
  return context;
}
