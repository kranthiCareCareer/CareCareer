import type { EventEnvelope } from './event-envelope.js';
import type { EventTransport } from './event-transport.js';

/**
 * In-memory event transport for testing and local development.
 * Events are stored in memory and can be inspected by tests.
 */
export class InMemoryEventTransport implements EventTransport {
  private readonly events: EventEnvelope[] = [];
  private healthy = true;

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.healthy) {
      throw new Error('Transport unhealthy');
    }
    this.events.push(envelope);
  }

  async publishBatch(envelopes: readonly EventEnvelope[]): Promise<void> {
    if (!this.healthy) {
      throw new Error('Transport unhealthy');
    }
    this.events.push(...envelopes);
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  // Test helpers
  getPublishedEvents(): readonly EventEnvelope[] {
    return [...this.events];
  }

  getEventsByType(eventType: string): readonly EventEnvelope[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  clear(): void {
    this.events.length = 0;
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  get publishedCount(): number {
    return this.events.length;
  }
}
