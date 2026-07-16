/**
 * Metric definition for registration.
 * Labels MUST be low-cardinality: method, path_template, status_code, error_code, type.
 * NEVER use: tenant_id, worker_id, facility_id, request_id, correlation_id.
 */
export interface MetricDefinition {
  readonly name: string;
  readonly help: string;
  readonly type: 'counter' | 'histogram' | 'gauge';
  readonly labels: readonly string[];
}

/**
 * Standard metrics for all CareCareer services.
 * Low-cardinality labels only.
 */
export const STANDARD_METRICS: readonly MetricDefinition[] = [
  {
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    type: 'counter',
    labels: ['method', 'path_template', 'status_code'],
  },
  {
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    type: 'histogram',
    labels: ['method', 'path_template', 'status_code'],
  },
  {
    name: 'authorization_decisions_total',
    help: 'Authorization decisions',
    type: 'counter',
    labels: ['decision', 'permission'],
  },
  {
    name: 'database_transaction_duration_seconds',
    help: 'DB transaction duration',
    type: 'histogram',
    labels: ['operation'],
  },
  { name: 'outbox_pending_total', help: 'Pending outbox events', type: 'gauge', labels: [] },
  {
    name: 'outbox_publish_attempts_total',
    help: 'Outbox publish attempts',
    type: 'counter',
    labels: ['result'],
  },
  {
    name: 'idempotency_results_total',
    help: 'Idempotency check results',
    type: 'counter',
    labels: ['result'],
  },
  {
    name: 'application_errors_total',
    help: 'Application errors',
    type: 'counter',
    labels: ['error_code', 'severity'],
  },
];

/**
 * Prohibited label values — these would create unbounded cardinality.
 */
export const PROHIBITED_LABELS = [
  'tenant_id',
  'tenantId',
  'worker_id',
  'workerId',
  'facility_id',
  'facilityId',
  'request_id',
  'requestId',
  'correlation_id',
  'correlationId',
  'user_id',
  'userId',
  'assignment_id',
  'shift_id',
] as const;

/**
 * Validates that metric labels do not contain prohibited high-cardinality values.
 */
export class MetricsRegistry {
  private readonly registered: MetricDefinition[] = [];

  register(definition: MetricDefinition): void {
    for (const label of definition.labels) {
      if ((PROHIBITED_LABELS as readonly string[]).includes(label)) {
        throw new Error(
          `Metric '${definition.name}' uses prohibited high-cardinality label '${label}'. ` +
            'Use traces or logs for per-entity observability, not metrics.',
        );
      }
    }
    this.registered.push(definition);
  }

  getRegistered(): readonly MetricDefinition[] {
    return [...this.registered];
  }
}
