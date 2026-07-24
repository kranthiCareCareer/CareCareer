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
    const nodemailer = await import('nodemailer');
    const smtpHost = process.env['SMTP_HOST'] ?? 'localhost';
    const smtpPort = parseInt(process.env['SMTP_PORT'] ?? '1025', 10);

    const transport = nodemailer.default.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      tls: { rejectUnauthorized: false },
    });

    const to = `user-${recipientId.slice(0, 8)}@carecareer.local`;

    await transport.sendMail({
      from: 'notifications@carecareer.local',
      to,
      subject,
      text: body,
    });
  }
}
