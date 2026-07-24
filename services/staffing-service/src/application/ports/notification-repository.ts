import type { TransactionClient } from '@carecareer/database';

export interface Notification {
  readonly id: string;
  readonly tenantId: string;
  readonly recipientId: string;
  readonly recipientType: string;
  readonly channel: 'EMAIL' | 'IN_APP' | 'SMS';
  readonly notificationType: string;
  readonly subject: string;
  readonly body: string;
  readonly metadata: Record<string, unknown>;
  readonly status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'READ';
  readonly deliveredAt?: Date | undefined;
  readonly readAt?: Date | undefined;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly lastError?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Notification repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface NotificationRepository {
  createNotification(tx: TransactionClient, notification: Notification): Promise<void>;
  getNotificationById(tx: TransactionClient, notificationId: string): Promise<Notification | null>;
  updateNotification(tx: TransactionClient, notification: Notification): Promise<void>;
  listByRecipient(tx: TransactionClient, recipientId: string): Promise<Notification[]>;
  listPending(tx: TransactionClient): Promise<Notification[]>;
  markDelivered(tx: TransactionClient, notificationId: string): Promise<void>;
  markRead(tx: TransactionClient, notificationId: string): Promise<void>;
  markFailed(tx: TransactionClient, notificationId: string, error: string): Promise<void>;
}
