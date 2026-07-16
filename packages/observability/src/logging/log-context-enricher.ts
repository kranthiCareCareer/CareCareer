import { getContext } from '@carecareer/request-context';

/**
 * Enriches log entries with request context.
 * Never includes sensitive data — only IDs and metadata.
 */
export class LogContextEnricher {
  private readonly service: string;
  private readonly version: string;
  private readonly environment: string;

  constructor(params: { service: string; version: string; environment: string }) {
    this.service = params.service;
    this.version = params.version;
    this.environment = params.environment;
  }

  /**
   * Build the standard context fields for a log entry.
   * Returns only safe, low-cardinality identifiers.
   */
  enrich(): {
    service: string;
    version: string;
    environment: string;
    requestId: string | undefined;
    correlationId: string | undefined;
    tenantId: string | undefined;
    actorId: string | undefined;
    actorType: string | undefined;
    traceId: string | undefined;
  } {
    const ctx = getContext();

    return {
      service: this.service,
      version: this.version,
      environment: this.environment,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      tenantId: ctx?.tenantId,
      actorId: ctx?.actorId,
      actorType: ctx?.actorType,
      traceId: ctx?.traceId,
    };
  }
}
