import type { TransactionClient } from '@carecareer/database';

import type { NotificationRepository, Notification } from '../ports/notification-repository.js';
import { createNotificationForEvent } from '../../infrastructure/notification-worker.js';

/**
 * Creates both EMAIL and IN_APP notifications for a domain event.
 * Called within the same transaction as the domain operation (outbox pattern).
 */
export class CreateNotificationHandler {
  constructor(private readonly notificationRepo: NotificationRepository) {}

  async execute(
    tx: TransactionClient,
    tenantId: string,
    recipientId: string,
    eventType: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    // Create EMAIL notification (will be picked up by worker)
    const emailNotification = createNotificationForEvent(
      tenantId,
      recipientId,
      eventType,
      details,
    );
    await this.notificationRepo.createNotification(tx, emailNotification);

    // Create IN_APP notification (immediately available)
    const inAppNotification: Notification = {
      ...emailNotification,
      id: crypto.randomUUID(),
      channel: 'IN_APP',
      status: 'DELIVERED',
      deliveredAt: new Date(),
    };
    await this.notificationRepo.createNotification(tx, inAppNotification);
  }
}
