import type { EventEnvelope } from './event-envelope.js';

/**
 * Transport interface for publishing events to external infrastructure.
 * Implementations: InMemoryEventTransport (local), SQS transport (AWS).
 * No Kafka transport — legacy Kafka is consumed only by migration adapters.
 */
export interface EventTransport {
  /** Publish an event envelope to the transport */
  publish(envelope: EventEnvelope): Promise<void>;

  /** Publish a batch of event envelopes */
  publishBatch(envelopes: readonly EventEnvelope[]): Promise<void>;

  /** Health check for the transport */
  isHealthy(): Promise<boolean>;
}
