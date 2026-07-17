import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';
import type { OutboxWriter } from '@carecareer/events';

import { createOrganizationCommand } from '../../application/commands/create-organization.command.js';
import { provisionTenant } from '../../application/commands/provision-tenant.command.js';
import { transitionTenant } from '../../application/commands/transition-tenant.command.js';
import { updateEntitlementsCommand } from '../../application/commands/update-entitlements.command.js';
import { updateFeatureCommand } from '../../application/commands/update-feature.command.js';
import {
  ADMINISTRATIVE_DATABASE,
  OUTBOX_WRITER,
  PLATFORM_REPOSITORY,
  TENANT_DATABASE,
} from '../../application/ports/injection-tokens.js';
import type { PlatformRepository } from '../../application/ports/platform-repository.js';
import {
  getTenantQuery,
  listOrganizationsQuery,
  getEntitlementsQuery,
  getFeatureConfigurationsQuery,
} from '../../application/queries/index.js';
import type { ModuleKey } from '../../domain/entitlement.js';
import {
  InvalidStateTransitionError,
  TenantNotFoundError,
  VersionConflictError,
  EntitlementRequiredError,
  InvalidFeatureValueError,
} from '../../domain/errors.js';
import type { FeatureKey } from '../../domain/feature-configuration.js';
import type { TenantStatus } from '../../domain/tenant.js';
import {
  ProvisionTenantSchema,
  LifecycleTransitionSchema,
  CreateOrganizationSchema,
  UpdateEntitlementsSchema,
  UpdateFeatureSchema,
} from '../dto/request-schemas.js';

/**
 * Platform tenant controller.
 * Auth guard applied at controller level — health endpoints remain public.
 */
@Controller('v1')
export class TenantController {
  constructor(
    @Inject(ADMINISTRATIVE_DATABASE) private readonly adminDb: AdministrativeDatabase,
    @Inject(TENANT_DATABASE) private readonly tenantDb: TenantAwareTransaction,
    @Inject(PLATFORM_REPOSITORY) private readonly repo: PlatformRepository,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  async provisionTenant(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-actor-id') actorId: string,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ data: { tenantId: string; organizationId: string } }> {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header required');
    if (!actorId) throw new BadRequestException('X-Actor-Id header required');

    const parsed = ProvisionTenantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const result = await provisionTenant(this.adminDb, this.repo, this.outboxWriter, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      organizationName: parsed.data.organizationName,
      actorId,
      correlationId: correlationId || idempotencyKey,
      idempotencyKey,
    });

    return { data: result };
  }

  @Get('tenants/:tenantId')
  async getTenant(@Param('tenantId') tenantId: string): Promise<{ data: unknown }> {
    const tenant = await getTenantQuery(this.tenantDb, this.repo, tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return { data: tenant };
  }

  @Post('tenants/:tenantId/activate')
  @HttpCode(HttpStatus.OK)
  async activateTenant(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-actor-id') actorId: string,
  ): Promise<{ status: string }> {
    return this.executeTransition(tenantId, 'ACTIVE', body, idempotencyKey, actorId);
  }

  @Post('tenants/:tenantId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendTenant(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-actor-id') actorId: string,
  ): Promise<{ status: string }> {
    return this.executeTransition(tenantId, 'SUSPENDED', body, idempotencyKey, actorId);
  }

  @Post('tenants/:tenantId/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateTenant(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-actor-id') actorId: string,
  ): Promise<{ status: string }> {
    return this.executeTransition(tenantId, 'DEACTIVATED', body, idempotencyKey, actorId);
  }

  @Post('tenants/:tenantId/organizations')
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-actor-id') actorId: string,
  ): Promise<{ data: { organizationId: string } }> {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key required');
    if (!actorId) throw new BadRequestException('X-Actor-Id required');

    const parsed = CreateOrganizationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const orgId = await createOrganizationCommand(this.tenantDb, this.repo, this.outboxWriter, {
      tenantId,
      name: parsed.data.name,
      actorId,
    });

    return { data: { organizationId: orgId } };
  }

  @Get('tenants/:tenantId/organizations')
  async listOrganizations(@Param('tenantId') tenantId: string): Promise<{ data: unknown[] }> {
    const orgs = await listOrganizationsQuery(this.tenantDb, this.repo, tenantId);
    return { data: orgs };
  }

  @Put('tenants/:tenantId/entitlements')
  @HttpCode(HttpStatus.OK)
  async updateEntitlements(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('x-actor-id') actorId: string,
  ): Promise<{ status: string }> {
    if (!actorId) throw new BadRequestException('X-Actor-Id required');

    const parsed = UpdateEntitlementsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    await updateEntitlementsCommand(this.tenantDb, this.repo, this.outboxWriter, {
      tenantId,
      modules: parsed.data.modules as Partial<Record<ModuleKey, boolean>>,
      actorId,
      expectedVersion: parsed.data.version,
    });

    return { status: 'updated' };
  }

  @Get('tenants/:tenantId/entitlements')
  async getEntitlements(@Param('tenantId') tenantId: string): Promise<{ data: unknown }> {
    const ent = await getEntitlementsQuery(this.tenantDb, this.repo, tenantId);
    return { data: ent };
  }

  @Put('tenants/:tenantId/features/:featureKey')
  @HttpCode(HttpStatus.OK)
  async updateFeature(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @Body() body: unknown,
    @Headers('x-actor-id') actorId: string,
  ): Promise<{ status: string }> {
    if (!actorId) throw new BadRequestException('X-Actor-Id required');

    const parsed = UpdateFeatureSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    try {
      await updateFeatureCommand(this.tenantDb, this.repo, this.outboxWriter, {
        tenantId,
        featureKey: featureKey as FeatureKey,
        value: parsed.data.value,
        actorId,
      });
    } catch (error: unknown) {
      if (error instanceof EntitlementRequiredError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof InvalidFeatureValueError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return { status: 'updated' };
  }

  @Get('tenants/:tenantId/features')
  async getFeatures(@Param('tenantId') tenantId: string): Promise<{ data: unknown[] }> {
    const features = await getFeatureConfigurationsQuery(this.tenantDb, this.repo, tenantId);
    return { data: features };
  }

  private async executeTransition(
    tenantId: string,
    targetStatus: TenantStatus,
    body: unknown,
    idempotencyKey: string,
    actorId: string,
  ): Promise<{ status: string }> {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key required');
    if (!actorId) throw new BadRequestException('X-Actor-Id required');

    const parsed = LifecycleTransitionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    try {
      await transitionTenant(this.tenantDb, this.repo, this.outboxWriter, {
        tenantId,
        targetStatus,
        reason: parsed.data.reason,
        actorId,
        expectedVersion: parsed.data.version,
      });
    } catch (error: unknown) {
      if (error instanceof TenantNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidStateTransitionError) {
        throw new UnprocessableEntityException(`Invalid transition: ${error.from} → ${error.to}`);
      }
      if (error instanceof VersionConflictError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return { status: targetStatus };
  }
}
