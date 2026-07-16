/**
 * Request context propagated through the entire request lifecycle.
 * Stored in AsyncLocalStorage for automatic propagation.
 */
export interface RequestContextData {
  /** Unique request identifier (server-generated) */
  readonly requestId: string;
  /** Correlation ID for distributed tracing (from header or generated) */
  readonly correlationId: string;
  /** Tenant ID (from authenticated JWT) */
  readonly tenantId?: string | undefined;
  /** Actor ID performing the action */
  readonly actorId?: string | undefined;
  /** Actor type */
  readonly actorType?: 'user' | 'service' | 'system' | undefined;
  /** OpenTelemetry trace ID */
  readonly traceId?: string | undefined;
  /** Request start timestamp */
  readonly startedAt: number;
}

/**
 * Immutable request context.
 * Once created, values cannot be changed — create a new context for changes.
 */
export class RequestContext implements RequestContextData {
  readonly requestId: string;
  readonly correlationId: string;
  readonly tenantId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly actorType?: 'user' | 'service' | 'system' | undefined;
  readonly traceId?: string | undefined;
  readonly startedAt: number;

  constructor(data: RequestContextData) {
    this.requestId = data.requestId;
    this.correlationId = data.correlationId;
    this.tenantId = data.tenantId;
    this.actorId = data.actorId;
    this.actorType = data.actorType;
    this.traceId = data.traceId;
    this.startedAt = data.startedAt;
  }

  /** Create a new context with additional tenant/actor information */
  withTenant(tenantId: string, actorId: string, actorType: 'user' | 'service' | 'system'): RequestContext {
    return new RequestContext({
      ...this,
      tenantId,
      actorId,
      actorType,
    });
  }

  /** Elapsed milliseconds since request started */
  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  /** Serializable representation for logs and events */
  toLogContext(): {
    requestId: string;
    correlationId: string;
    tenantId: string | undefined;
    actorId: string | undefined;
    actorType: string | undefined;
    traceId: string | undefined;
  } {
    return {
      requestId: this.requestId,
      correlationId: this.correlationId,
      tenantId: this.tenantId,
      actorId: this.actorId,
      actorType: this.actorType,
      traceId: this.traceId,
    };
  }
}
