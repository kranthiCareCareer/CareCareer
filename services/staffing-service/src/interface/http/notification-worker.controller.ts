/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';

import type { TenantAwareTransaction } from '@carecareer/database';

import type { NotificationRepository } from '../../application/ports/notification-repository.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

/**
 * Notification worker trigger endpoint.
 * Processes pending notifications and delivers via SMTP (MailHog for demo).
 * In production this would be a background job, not an HTTP endpoint.
 */
@Controller('v1/notifications')
export class NotificationWorkerController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('NOTIFICATION_REPOSITORY') private readonly notificationRepo: NotificationRepository,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notifications:admin')
  async processNotifications(@Req() req: AuthenticatedStaffingRequest) {
    const principal = requirePrincipal(req);

    const result = await this.db.execute(principal.selectedTenantId, async (tx) => {
      const pending = await this.notificationRepo.listPending(tx);
      let delivered = 0;
      let failed = 0;

      for (const notification of pending) {
        try {
          if (notification.channel === 'EMAIL') {
            await this.sendEmail(notification.recipientId, notification.subject, notification.body);
          }
          await this.notificationRepo.markDelivered(tx, notification.id);
          delivered++;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          await this.notificationRepo.markFailed(tx, notification.id, errorMsg);
          failed++;
        }
      }

      return { processed: pending.length, delivered, failed };
    });

    return result;
  }

  private async sendEmail(recipientId: string, subject: string, body: string): Promise<void> {
    const smtpHost = process.env['SMTP_HOST'] ?? 'localhost';
    const smtpPort = parseInt(process.env['SMTP_PORT'] ?? '1025', 10);
    const to = `user-${recipientId.slice(0, 8)}@carecareer.local`;

    const net = await import('node:net');
    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(smtpPort, smtpHost);
      let step = 0;

      socket.on('data', () => {
        step++;
        switch (step) {
          case 1:
            socket.write('EHLO localhost\r\n');
            break;
          case 2:
            socket.write(`MAIL FROM:<notifications@carecareer.local>\r\n`);
            break;
          case 3:
            socket.write(`RCPT TO:<${to}>\r\n`);
            break;
          case 4:
            socket.write('DATA\r\n');
            break;
          case 5:
            socket.write(`From: notifications@carecareer.local\r\n`);
            socket.write(`To: ${to}\r\n`);
            socket.write(`Subject: ${subject}\r\n`);
            socket.write('\r\n');
            socket.write(`${body}\r\n`);
            socket.write('.\r\n');
            break;
          case 6:
            socket.write('QUIT\r\n');
            socket.end();
            resolve();
            break;
        }
      });

      socket.on('error', reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('SMTP timeout'));
      });
    });
  }
}
