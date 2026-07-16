/**
 * Standard error envelope data.
 * Used across all services for consistent error responses.
 * NEVER includes stack traces, SQL, vendor errors, or sensitive data.
 */
export interface ErrorEnvelopeData {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly timestamp: string;
  readonly details?: readonly Record<string, unknown>[] | undefined;
}

/**
 * Builds standard error envelopes for HTTP responses.
 * Internal errors (500) never expose internals.
 */
export class StandardErrorEnvelope {
  /**
   * Build a client-safe error envelope.
   * Stack traces and internal details are excluded.
   */
  static build(params: {
    code: string;
    message: string;
    correlationId: string;
    requestId: string;
    details?: readonly Record<string, unknown>[];
  }): { error: ErrorEnvelopeData } {
    return {
      error: {
        code: params.code,
        message: params.message,
        correlationId: params.correlationId,
        requestId: params.requestId,
        timestamp: new Date().toISOString(),
        details: params.details,
      },
    };
  }

  /**
   * Build a safe 500 error — no internals exposed.
   */
  static internalError(params: { correlationId: string; requestId: string }): {
    error: ErrorEnvelopeData;
  } {
    return StandardErrorEnvelope.build({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please contact support with the correlation ID.',
      correlationId: params.correlationId,
      requestId: params.requestId,
    });
  }
}
