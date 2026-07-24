import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { TenantAwareTransaction } from '@carecareer/database';

import type { AuditRepository } from '../../application/ports/audit-repository.js';
import type { AuthenticatedStaffingRequest } from '../../infrastructure/authenticated-request.js';
import { requirePrincipal } from '../../infrastructure/require-principal.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

@Controller('v1/audit')
export class AuditController {
  constructor(
    @Inject('STAFFING_TENANT_DB') private readonly db: TenantAwareTransaction,
    @Inject('AUDIT_REPOSITORY') private readonly auditRepo: AuditRepository,
  ) {}

  /** List audit entries for the tenant. */
  @Get()
  @RequirePermission('audit:read')
  async listAuditEntries(
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const entries = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.auditRepo.listByTenant(tx, {
        action,
        resourceType,
        limit: limit ? parseInt(limit, 10) : 100,
      });
    });

    return { data: entries, total: entries.length };
  }

  /** Get audit history for a specific resource. */
  @Get(':resourceType/:resourceId')
  @RequirePermission('audit:read')
  async getResourceAudit(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Req() req: AuthenticatedStaffingRequest,
  ) {
    const principal = requirePrincipal(req);

    const entries = await this.db.execute(principal.selectedTenantId, async (tx) => {
      return this.auditRepo.listByResource(tx, resourceType, resourceId);
    });

    return { data: entries, total: entries.length };
  }
}
