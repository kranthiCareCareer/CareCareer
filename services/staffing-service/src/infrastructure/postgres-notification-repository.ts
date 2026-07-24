import type { TransactionClient } from '@carecareer/database';

import type {
  Notification,
  NotificationRepository,
} from '../application/ports/notification-repository.js';

/**
 * PostgreSQL implementation of the NotificationRepository port.
 * All queries run within a tenant-scoped transaction (RLS enforced).
 */
export class PostgresNotificationRepository implements NotificationRepository {
  async createNotification(tx: TransactionClient, n: Notification): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO staffing.notifications (
        id, tenant_id, recipient_id, recipient_type, channel,
        notification_type, subject, body, metadata, status,
        delivered_at, read_at, retry_count, max_retries, last_error,
        created_at, updated_at
      ) VALUES (
        ${n.id}::uuid, ${n.tenantId}::uuid, ${n.recipientId}::uuid,
        ${n.recipientType}, ${n.channel}, ${n.notificationType},
        ${n.subject}, ${n.body}, ${JSON.stringify(n.metadata)}::jsonb,
        ${n.status}, ${n.deliveredAt?.toISOString() ?? null}::timestamptz,
        ${n.readAt?.toISOString() ?? null}::timestamptz,
        ${n.retryCount}, ${n.maxRetries}, ${n.lastError ?? null},
        ${n.createdAt.toISOString()}::timestamptz,
        ${n.updatedAt.toISOString()}::timestamptz
      )`;
  }

  async getNotificationById(
    tx: TransactionClient,
    notificationId: string,
  ): Promise<Notification | null> {
    const rows = await tx.$queryRaw<NotificationRow>`
      SELECT * FROM staffing.notifications WHERE id = ${notificationId}::uuid`;
    if (rows.length === 0) return null;
    return mapNotification(rows[0]!);
  }

  async updateNotification(tx: TransactionClient, n: Notification): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.notifications SET
        status = ${n.status},
        delivered_at = ${n.deliveredAt?.toISOString() ?? null}::timestamptz,
        read_at = ${n.readAt?.toISOString() ?? null}::timestamptz,
        retry_count = ${n.retryCount},
        last_error = ${n.lastError ?? null},
        updated_at = NOW()
      WHERE id = ${n.id}::uuid`;
  }

  async listByRecipient(tx: TransactionClient, recipientId: string): Promise<Notification[]> {
    const rows = await tx.$queryRaw<NotificationRow>`
      SELECT * FROM staffing.notifications
      WHERE recipient_id = ${recipientId}::uuid
      ORDER BY created_at DESC`;
    return rows.map(mapNotification);
  }

  async listPending(tx: TransactionClient): Promise<Notification[]> {
    const rows = await tx.$queryRaw<NotificationRow>`
      SELECT * FROM staffing.notifications
      WHERE status = 'PENDING' AND retry_count < max_retries
      ORDER BY created_at
      LIMIT 100`;
    return rows.map(mapNotification);
  }

  async markDelivered(tx: TransactionClient, notificationId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.notifications SET
        status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
      WHERE id = ${notificationId}::uuid`;
  }

  async markRead(tx: TransactionClient, notificationId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.notifications SET
        status = 'READ', read_at = NOW(), updated_at = NOW()
      WHERE id = ${notificationId}::uuid`;
  }

  async markFailed(tx: TransactionClient, notificationId: string, error: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.notifications SET
        status = CASE WHEN retry_count + 1 >= max_retries THEN 'FAILED' ELSE 'PENDING' END,
        retry_count = retry_count + 1,
        last_error = ${error},
        updated_at = NOW()
      WHERE id = ${notificationId}::uuid`;
  }
}

interface NotificationRow {
  id: string;
  tenant_id: string;
  recipient_id: string;
  recipient_type: string;
  channel: string;
  notification_type: string;
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
  status: string;
  delivered_at: string | null;
  read_at: string | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    recipientId: r.recipient_id,
    recipientType: r.recipient_type,
    channel: r.channel as Notification['channel'],
    notificationType: r.notification_type,
    subject: r.subject,
    body: r.body,
    metadata: r.metadata ?? {},
    status: r.status as Notification['status'],
    deliveredAt: r.delivered_at ? new Date(r.delivered_at) : undefined,
    readAt: r.read_at ? new Date(r.read_at) : undefined,
    retryCount: r.retry_count,
    maxRetries: r.max_retries,
    lastError: r.last_error ?? undefined,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
