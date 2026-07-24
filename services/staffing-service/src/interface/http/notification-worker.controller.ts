/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';

import type { TenantAwareTransaction } from '@carecareer/database';

import type { NotificationRepository } from '../../application/ports/notification-repository.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';

const LEASE_DURATION_MS = 60_000; // 60 seconds
const MAX_RETRIES = 3;

/**
 * Notification worker endpoint with atomic claim-lease-finalize pattern.
 *
 * Design:
 * 1. CLAIM: Atomically claim a pending notification (INSERT claim_owner + claim_token + lease)
 * 2. DELIVER: Send email OUTSIDE the database transaction
 * 3. FINALIZE: Mark delivered only if claim ownership still matches
 *
 * Concurrency safety:
 * - Two workers cannot claim the same notification (atomic UPDATE ... WHERE)
 * - SMTP failure does not lose the notification (claim released on error)
 * - Expired leases can be reclaimed by another worker
 * - Stale workers cannot finalize after ownership changes
 *
 * This is an authenticated internal endpoint (notifications:admin permission).
 * In production, this would be invoked by a background job scheduler.
 */
@Controller('v1/notifications')
export class NotificationWorkerController {
  private readonly workerId = crypto.randomUUID();

  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Inject('NOTIFICATION_REPOSITORY') _repo: NotificationRepository,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notifications:admin')
  async processNotifications(@Req() req: AuthenticatedStaffingRequest) {
    const principal = requirePrincipal(req);
    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    // Phase 1: Claim pending notifications
    const claimed = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.claimBatch(tx);
    });

    // Phase 2: Deliver each claimed notification OUTSIDE the DB transaction
    for (const claim of claimed) {
      try {
        if (claim.channel === 'EMAIL') {
          await this.sendEmail(claim.recipientId, claim.subject, claim.body);
        }

        // Phase 3: Finalize — mark delivered only if we still own the claim
        const finalized = await this.db.execute(principal.selectedTenantId, async (tx) => {
          return this.finalizeDelivery(tx, claim.id, claim.claimToken);
        });

        if (finalized) {
          delivered++;
        } else {
          skipped++; // Ownership lost — another worker took over
        }
      } catch (err: unknown) {
        // Delivery failed — release claim and record error
        const errorMsg = err instanceof Error ? err.message : 'Unknown delivery error';
        const sanitizedError = errorMsg
          .slice(0, 200)
          .replace(/\/app\//g, '')
          .replace(/node_modules/g, '');

        await this.db.execute(principal.selectedTenantId, async (tx) => {
          await this.releaseWithError(tx, claim.id, claim.claimToken, sanitizedError);
        });
        failed++;
      }
    }

    return { processed: claimed.length, delivered, failed, skipped };
  }

  /**
   * Atomically claim a batch of pending notifications.
   * Uses UPDATE ... WHERE to prevent concurrent claims.
   */
  private async claimBatch(
    tx: import('@carecareer/database').TransactionClient,
  ): Promise<
    Array<{
      id: string;
      recipientId: string;
      channel: string;
      subject: string;
      body: string;
      claimToken: string;
    }>
  > {
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + LEASE_DURATION_MS);
    const claimToken = crypto.randomUUID();

    // Claim up to 10 unclaimed or expired-lease notifications
    const rows = await tx.$queryRaw<{
      id: string;
      recipient_id: string;
      channel: string;
      subject: string;
      body: string;
    }>`
      UPDATE staffing.notifications SET
        claim_owner = ${this.workerId},
        claim_token = ${claimToken}::uuid,
        lease_expires_at = ${leaseExpires.toISOString()}::timestamptz,
        last_attempt_at = ${now.toISOString()}::timestamptz
      WHERE id IN (
        SELECT id FROM staffing.notifications
        WHERE status = 'PENDING'
          AND terminal_failure = FALSE
          AND retry_count < ${MAX_RETRIES}
          AND (claim_owner IS NULL OR lease_expires_at < ${now.toISOString()}::timestamptz)
        ORDER BY created_at
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, recipient_id, channel, subject, body`;

    return rows.map((r) => ({
      id: r.id,
      recipientId: r.recipient_id,
      channel: r.channel,
      subject: r.subject,
      body: r.body,
      claimToken,
    }));
  }

  /**
   * Finalize delivery — mark as DELIVERED only if claim ownership matches.
   * Returns true if finalized, false if ownership was lost.
   */
  private async finalizeDelivery(
    tx: import('@carecareer/database').TransactionClient,
    notificationId: string,
    claimToken: string,
  ): Promise<boolean> {
    const count = await tx.$executeRaw`
      UPDATE staffing.notifications SET
        status = 'DELIVERED',
        delivered_at = NOW(),
        claim_owner = NULL,
        claim_token = NULL,
        lease_expires_at = NULL,
        updated_at = NOW()
      WHERE id = ${notificationId}::uuid
        AND claim_token = ${claimToken}::uuid
        AND status = 'PENDING'`;
    return count > 0;
  }

  /**
   * Release a claim after delivery failure. Increments retry count.
   * If max retries exceeded, marks as terminal failure.
   */
  private async releaseWithError(
    tx: import('@carecareer/database').TransactionClient,
    notificationId: string,
    claimToken: string,
    error: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE staffing.notifications SET
        claim_owner = NULL,
        claim_token = NULL,
        lease_expires_at = NULL,
        retry_count = retry_count + 1,
        last_error = ${error},
        terminal_failure = CASE WHEN retry_count + 1 >= max_retries THEN TRUE ELSE FALSE END,
        status = CASE WHEN retry_count + 1 >= max_retries THEN 'FAILED' ELSE 'PENDING' END,
        updated_at = NOW()
      WHERE id = ${notificationId}::uuid
        AND claim_token = ${claimToken}::uuid`;
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
