/**
 * Standard domain event envelope.
 * Every event published in CareCareer uses this structure.
 */
export interface EventEnvelope<TData = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly source: string;
  readonly actor?:
    | {
        readonly type: 'user' | 'service' | 'system';
        readonly id?: string | undefined;
      }
    | undefined;
  readonly data: TData;
}
