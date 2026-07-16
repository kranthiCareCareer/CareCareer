/**
 * Thrown when an event cannot be published to the transport.
 */
export class EventPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventPublishError';
  }
}

/**
 * Thrown when the outbox write fails within a transaction.
 * This should cause the entire transaction to roll back.
 */
export class OutboxWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxWriteError';
  }
}
