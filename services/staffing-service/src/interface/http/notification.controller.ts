import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { TenantAwareTransaction } from '@carecareer/database';

import type { NotificationRepository } from '../../application/ports/notification-repository.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

@Controller('v1/notifications')
export class NotificationController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('NOTIFICATION_REPOSITORY') private readonly notificationRepo: NotificationRepository,
  ) {}

  /** List notifications for the current user. */
  @Get()
  @RequirePermission('notifications:read')
  async listMyNotifications(@Req() req: AuthenticatedStaffingRequest) {
    const principal = requirePrincipal(req);

    const notifications = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.notificationRepo.listByRecipient(tx, principal.subject);
    });

    return { data: notifications, total: notifications.length };
  }

  /** List notifications for a specific recipient (admin view). */
  @Get('recipient/:recipientId')
  @RequirePermission('notifications:admin')
  async listByRecipient(
    @Param('recipientId') recipientId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const notifications = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.notificationRepo.listByRecipient(tx, recipientId);
    });

    return { data: notifications, total: notifications.length };
  }

  /** Mark a notification as read. */
  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notifications:read')
  async markAsRead(
    @Param('notificationId') notificationId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    await this.db.execute(principal.selectedTenantId, async (tx) => {
      await this.notificationRepo.markRead(tx, notificationId);
    });

    return { id: notificationId, status: 'READ' };
  }
}
