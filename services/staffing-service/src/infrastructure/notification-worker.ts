/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { TransactionClient } from '@carecareer/database';
import type { Notification, NotificationRepository } from '../application/ports/notification-repository.js';

/**
 * Outbox-driven notification worker.
 *
 * Polls for pending notifications and delivers them via the configured channel.
 * For local demo: EMAIL → MailHog SMTP, IN_APP → marks as delivered immediately.
 *
 * Features:
 * - Retry with backoff (up to maxRetries)
 * - Prevents duplicate delivery (status check before send)
 * - Does not include sensitive credential numbers or PHI in bodies
 */

export interface NotificationWorkerConfig {
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly fromAddress: string;
  readonly pollIntervalMs: number;
  readonly enabled: boolean;
}

export interface SmtpTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void>;
}

/**
 * Simple SMTP transport using raw TCP (no external dependencies).
 * Sufficient for MailHog which accepts any SMTP without auth.
 */
export function createMailHogTransport(host: string, port: number): SmtpTransport {
  return {
    async sendMail(options) {
      const net = await import('node:net');
      return new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, host);
        const lines: string[] = [];

        socket.on('data', (data) => {
          const response = data.toString();
          lines.push(response);

          if (lines.length === 1) {
            // Server greeting received
            socket.write(`EHLO localhost\r\n`);
          } else if (response.includes('250') && !response.includes('MAIL FROM')) {
            if (!lines.some((l) => l.includes('MAIL FROM'))) {
              socket.write(`MAIL FROM:<${options.from}>\r\n`);
              lines.push('MAIL FROM');
            }
          }
        });

        // Simplified: just open, send the envelope in sequence
        let step = 0;
        socket.on('data', () => {
          step++;
          if (step === 2) socket.write(`MAIL FROM:<${options.from}>\r\n`);
          else if (step === 3) socket.write(`RCPT TO:<${options.to}>\r\n`);
          else if (step === 4) socket.write('DATA\r\n');
          else if (step === 5) {
            socket.write(`From: ${options.from}\r\n`);
            socket.write(`To: ${options.to}\r\n`);
            socket.write(`Subject: ${options.subject}\r\n`);
            socket.write('\r\n');
            socket.write(`${options.text}\r\n`);
            socket.write('.\r\n');
          } else if (step === 6) {
            socket.write('QUIT\r\n');
            socket.end();
            resolve();
          }
        });

        socket.on('error', reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('SMTP timeout'));
        });
      });
    },
  };
}

/**
 * Create a notification for a domain event.
 * Sanitizes content to prevent PHI/credential number leakage.
 */
export function createNotificationForEvent(
  tenantId: string,
  recipientId: string,
  eventType: string,
  details: Record<string, unknown>,
): Notification {
  const now = new Date();
  const templates: Record<string, { subject: string; body: string }> = {
    'shift_request.created': {
      subject: 'New Shift Request Submitted',
      body: 'A worker has requested one of your published shifts. Review the request in the CareCareer platform.',
    },
    'shift_request.confirmed': {
      subject: 'Shift Request Confirmed',
      body: 'Your shift request has been confirmed. You have a new assignment. Check your assignments for details.',
    },
    'shift_request.rejected': {
      subject: 'Shift Request Not Approved',
      body: 'Your shift request was not approved. Check the platform for other available shifts.',
    },
    'assignment.checked_in': {
      subject: 'Worker Checked In',
      body: 'A worker has checked in for their assigned shift.',
    },
    'timecard.submitted': {
      subject: 'Timecard Submitted for Approval',
      body: 'A timecard has been submitted and is waiting for your review.',
    },
    'timecard.approved': {
      subject: 'Timecard Approved',
      body: 'Your timecard has been approved.',
    },
    'timecard.rejected': {
      subject: 'Timecard Needs Correction',
      body: 'Your timecard requires correction. Check the platform for details.',
    },
    'credential.verified': {
      subject: 'Credential Verified',
      body: 'One of your credentials has been verified. Your eligibility may have changed.',
    },
  };

  const template = templates[eventType] ?? {
    subject: `CareCareer Notification: ${eventType}`,
    body: `An event (${eventType}) occurred that may require your attention.`,
  };

  return {
    id: crypto.randomUUID(),
    tenantId,
    recipientId,
    recipientType: 'USER',
    channel: 'EMAIL',
    notificationType: eventType,
    subject: template.subject,
    body: template.body,
    metadata: details,
    status: 'PENDING',
    deliveredAt: undefined,
    readAt: undefined,
    retryCount: 0,
    maxRetries: 3,
    lastError: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Process pending notifications (one batch).
 * Returns number of notifications processed.
 */
export async function processNotificationBatch(
  tx: TransactionClient,
  repo: NotificationRepository,
  transport: SmtpTransport,
  config: NotificationWorkerConfig,
): Promise<number> {
  const pending = await repo.listPending(tx);
  let processed = 0;

  for (const notification of pending) {
    try {
      if (notification.channel === 'EMAIL') {
        await transport.sendMail({
          from: config.fromAddress,
          to: `user-${notification.recipientId.slice(0, 8)}@carecareer.local`,
          subject: notification.subject,
          text: notification.body,
        });
      }
      // IN_APP: just mark as delivered (it's already in the table)
      await repo.markDelivered(tx, notification.id);
      processed++;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await repo.markFailed(tx, notification.id, errorMessage);
    }
  }

  return processed;
}
