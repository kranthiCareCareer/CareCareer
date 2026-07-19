import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';

import type { AuthenticatedPrincipal } from '@carecareer/auth';
import type { AdministrativeDatabase, TenantAwareTransaction } from '@carecareer/database';

import {
  assignMembershipRolesCommand,
  assignPlatformRoleCommand,
  changeMembershipStatusCommand,
  createMembershipCommand,
  removePlatformRoleCommand,
} from '../../application/commands/membership-commands.js';
import type { IdentityRepository } from '../../application/ports/identity-repository.js';
import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  TENANT_DATABASE,
} from '../../application/ports/injection-tokens.js';
import type { MembershipRepository } from '../../application/ports/membership-repository.js';
import {
  DuplicateMembershipError,
  InvalidRoleAssignmentError,
  InvalidStatusTransitionError,
  MembershipNotFoundError,
  UserNotFoundError,
  VersionConflictError,
} from '../../domain/errors.js';
import type { MembershipStatus } from '../../domain/membership-status.js';
import { deriveEffectivePermissions } from '../../domain/permission.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Membership, role, and permission management endpoints.
 */
@Controller('v1')
export class MembershipController {
  constructor(
    @Inject(ADMINISTRATIVE_DATABASE) private readonly adminDb: AdministrativeDatabase,
    @Inject(TENANT_DATABASE) private readonly tenantDb: TenantAwareTransaction,
    @Inject(IDENTITY_REPOSITORY) private readonly identityRepo: IdentityRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepo: MembershipRepository,
  ) {}

  // ─── Tenant Members ───────────────────────────────────────────────────────

  @Post('tenants/:tenantId/members')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('tenant.members.manage')
  async createMember(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(tenantId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid tenant ID format' });
    }

    const parsed = createMemberSchema(body);
    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const membership = await createMembershipCommand(
        this.tenantDb,
        this.membershipRepo,
        this.identityRepo,
        this.adminDb,
        {
          userId: parsed.userId,
          tenantId,
          status: parsed.status as MembershipStatus | undefined,
          actorId,
          correlationId: corrId,
        },
      );

      return { data: mapMembershipResponse(membership) };
    } catch (error: unknown) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException({ code: error.code, message: error.message });
      }
      if (error instanceof DuplicateMembershipError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  @Get('tenants/:tenantId/members')
  @RequirePermission('tenant.members.read')
  async listMembers(
    @Param('tenantId') tenantId: string,
    @Query() query: unknown,
    @Headers('x-correlation-id') _correlationId?: string,
  ): Promise<{ data: unknown[]; pagination: unknown }> {
    if (!isValidUuid(tenantId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid tenant ID format' });
    }

    const params = parseListParams(query);

    const { memberships, total } = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.membershipRepo.listMembershipsByTenant(tx, tenantId, params);
    });

    return {
      data: memberships.map(mapMembershipResponse),
      pagination: { offset: params.offset, limit: params.limit, total },
    };
  }

  @Get('tenants/:tenantId/members/:membershipId')
  @RequirePermission('tenant.members.read')
  async getMember(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(tenantId) || !isValidUuid(membershipId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid UUID format' });
    }

    const membership = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.membershipRepo.findMembershipById(tx, membershipId);
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Membership not found',
      });
    }

    return { data: mapMembershipResponse(membership) };
  }

  @Patch('tenants/:tenantId/members/:membershipId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenant.members.manage')
  async changeMemberStatus(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(tenantId) || !isValidUuid(membershipId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid UUID format' });
    }

    const parsed = changeStatusSchema(body);
    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const membership = await changeMembershipStatusCommand(this.tenantDb, this.membershipRepo, {
        membershipId,
        tenantId,
        targetStatus: parsed.status as MembershipStatus,
        expectedVersion: parsed.version,
        reason: parsed.reason,
        actorId,
        correlationId: corrId,
      });

      return { data: mapMembershipResponse(membership) };
    } catch (error: unknown) {
      if (error instanceof MembershipNotFoundError) {
        throw new NotFoundException({ code: error.code, message: error.message });
      }
      if (error instanceof InvalidStatusTransitionError) {
        throw new ConflictException({
          code: error.code,
          message: error.message,
          from: error.from,
          to: error.to,
        });
      }
      if (error instanceof VersionConflictError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  // ─── Membership Roles ─────────────────────────────────────────────────────

  @Get('tenants/:tenantId/members/:membershipId/roles')
  @RequirePermission('tenant.members.read')
  async getMemberRoles(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<{ data: unknown[] }> {
    if (!isValidUuid(tenantId) || !isValidUuid(membershipId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid UUID format' });
    }

    const roles = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.membershipRepo.listMembershipRoles(tx, membershipId);
    });

    return { data: roles.map((r) => ({ id: r.id, name: r.name, scope: r.scope })) };
  }

  @Put('tenants/:tenantId/members/:membershipId/roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tenant.roles.assign')
  async assignMemberRoles(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(tenantId) || !isValidUuid(membershipId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid UUID format' });
    }

    const parsed = assignRolesSchema(body);
    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const membership = await assignMembershipRolesCommand(this.tenantDb, this.membershipRepo, {
        membershipId,
        tenantId,
        roleIds: parsed.roleIds,
        actorId,
        correlationId: corrId,
        expectedVersion: parsed.version,
      });

      return { data: mapMembershipResponse(membership) };
    } catch (error: unknown) {
      if (error instanceof MembershipNotFoundError) {
        throw new NotFoundException({ code: error.code, message: error.message });
      }
      if (error instanceof InvalidRoleAssignmentError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      if (error instanceof VersionConflictError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  // ─── Effective Permissions ────────────────────────────────────────────────

  @Get('tenants/:tenantId/members/:membershipId/permissions')
  @RequirePermission('tenant.members.read')
  async getMemberPermissions(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ): Promise<{ data: unknown[] }> {
    if (!isValidUuid(tenantId) || !isValidUuid(membershipId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid UUID format' });
    }

    const permissions = await this.tenantDb.execute(tenantId, async (tx) => {
      const membership = await this.membershipRepo.findMembershipById(tx, membershipId);
      if (!membership) {
        throw new MembershipNotFoundError(membershipId);
      }

      const roleAssignments = await this.membershipRepo.listMembershipRoleAssignments(
        tx,
        membershipId,
      );
      const roleIds = roleAssignments.map((ra) => ra.roleId);
      const allRoles = await this.membershipRepo.listRoles(tx);
      const rolePermissions = await this.membershipRepo.listRolePermissions(tx);
      const allPermissions = await this.membershipRepo.listPermissions(tx);

      return deriveEffectivePermissions(
        membership.status,
        roleIds,
        allRoles,
        rolePermissions,
        allPermissions,
      );
    });

    return {
      data: permissions.map((p) => ({ id: p.id, identifier: p.identifier, scope: p.scope })),
    };
  }

  // ─── Tenant Roles Catalog ─────────────────────────────────────────────────

  @Get('tenants/:tenantId/roles')
  @RequirePermission('tenant.members.read')
  async listTenantRoles(@Param('tenantId') tenantId: string): Promise<{ data: unknown[] }> {
    if (!isValidUuid(tenantId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid tenant ID format' });
    }

    const roles = await this.tenantDb.execute(tenantId, async (tx) => {
      return this.membershipRepo.listTenantRoles(tx);
    });

    return {
      data: roles.map((r) => ({
        id: r.id,
        name: r.name,
        scope: r.scope,
        roleType: r.roleType,
        description: r.description,
      })),
    };
  }

  // ─── Permissions Catalog ──────────────────────────────────────────────────

  @Get('permissions')
  @RequirePermission('tenant.members.read')
  async listPermissions(): Promise<{ data: unknown[] }> {
    const permissions = await this.adminDb.execute(
      { actorId: 'system', reason: 'Permission catalog', correlationId: 'catalog' },
      async (tx) => this.membershipRepo.listPermissions(tx),
    );

    return {
      data: permissions.map((p) => ({
        id: p.id,
        identifier: p.identifier,
        scope: p.scope,
        description: p.description,
      })),
    };
  }

  // ─── Platform User Memberships ────────────────────────────────────────────

  @Get('platform/users/:userId/memberships')
  @RequirePermission('platform.users.read')
  async listUserMemberships(@Param('userId') userId: string): Promise<{ data: unknown[] }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const memberships = await this.adminDb.execute(
      { actorId: 'system', reason: 'List user memberships', correlationId: crypto.randomUUID() },
      async (tx) => this.membershipRepo.listMembershipsByUser(tx, userId),
    );

    return { data: memberships.map(mapMembershipResponse) };
  }

  // ─── Platform Roles ───────────────────────────────────────────────────────

  @Get('platform/users/:userId/platform-roles')
  @RequirePermission('platform.users.read')
  async listPlatformRoles(@Param('userId') userId: string): Promise<{ data: unknown[] }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const assignments = await this.adminDb.execute(
      { actorId: 'system', reason: 'List platform roles', correlationId: crypto.randomUUID() },
      async (tx) => this.membershipRepo.listPlatformRoleAssignments(tx, userId),
    );

    return {
      data: assignments.map((a) => ({
        roleId: a.roleId,
        assignedBy: a.assignedBy,
        assignedAt: a.assignedAt.toISOString(),
      })),
    };
  }

  @Put('platform/users/:userId/platform-roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('platform.users.manage')
  async setPlatformRoles(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ status: string }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const parsed = platformRolesSchema(body);
    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    // Get current assignments
    const currentAssignments = await this.adminDb.execute(
      { actorId, reason: 'Read current platform roles', correlationId: corrId },
      async (tx) => this.membershipRepo.listPlatformRoleAssignments(tx, userId),
    );

    const currentRoleIds = new Set(currentAssignments.map((a) => a.roleId));
    const targetRoleIds = new Set(parsed.roleIds);

    // Remove roles not in target
    for (const current of currentAssignments) {
      if (!targetRoleIds.has(current.roleId)) {
        try {
          await removePlatformRoleCommand(this.adminDb, this.membershipRepo, this.identityRepo, {
            userId,
            roleId: current.roleId,
            actorId,
            correlationId: corrId,
          });
        } catch (error: unknown) {
          if (error instanceof UserNotFoundError) {
            throw new NotFoundException({ code: 'USER_NOT_FOUND', message: error.message });
          }
          throw error;
        }
      }
    }

    // Add roles not in current
    for (const roleId of parsed.roleIds) {
      if (!currentRoleIds.has(roleId)) {
        try {
          await assignPlatformRoleCommand(this.adminDb, this.membershipRepo, this.identityRepo, {
            userId,
            roleId,
            actorId,
            correlationId: corrId,
          });
        } catch (error: unknown) {
          if (error instanceof UserNotFoundError) {
            throw new NotFoundException({ code: 'USER_NOT_FOUND', message: error.message });
          }
          if (error instanceof InvalidRoleAssignmentError) {
            throw new BadRequestException({ code: error.code, message: error.message });
          }
          throw error;
        }
      }
    }

    return { status: 'updated' };
  }
}

// ─── Schema Validation Helpers ────────────────────────────────────────────────

const CreateMemberZod = z
  .object({
    userId: z.string().uuid(),
    status: z.enum(['INVITED', 'ACTIVE']).optional(),
  })
  .strict();

function createMemberSchema(body: unknown): { userId: string; status?: string | undefined } {
  const result = CreateMemberZod.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      errors: result.error.issues,
    });
  }
  return result.data;
}

const ChangeStatusZod = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
    reason: z.string().min(1).max(500),
    version: z.number().int().positive(),
  })
  .strict();

function changeStatusSchema(body: unknown): { status: string; reason: string; version: number } {
  const result = ChangeStatusZod.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      errors: result.error.issues,
    });
  }
  return result.data;
}

const AssignRolesZod = z
  .object({
    roleIds: z.array(z.string().uuid()).min(0).max(10),
    version: z.number().int().positive(),
  })
  .strict();

function assignRolesSchema(body: unknown): { roleIds: string[]; version: number } {
  const result = AssignRolesZod.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      errors: result.error.issues,
    });
  }
  return result.data;
}

const PlatformRolesZod = z
  .object({
    roleIds: z.array(z.string().uuid()).min(0).max(5),
  })
  .strict();

function platformRolesSchema(body: unknown): { roleIds: string[] } {
  const result = PlatformRolesZod.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      errors: result.error.issues,
    });
  }
  return result.data;
}

function parseListParams(query: unknown): {
  offset: number;
  limit: number;
  status?: string | undefined;
} {
  const q = query as Record<string, unknown>;
  return {
    offset: Math.max(0, Number(q['offset']) || 0),
    limit: Math.min(100, Math.max(1, Number(q['limit']) || 20)),
    status: typeof q['status'] === 'string' ? q['status'] : undefined,
  };
}

// ─── Response Mapping ─────────────────────────────────────────────────────────

function mapMembershipResponse(m: {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  authorizationVersion: number;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}): Record<string, unknown> {
  return {
    id: m.id,
    userId: m.userId,
    tenantId: m.tenantId,
    status: m.status,
    authorizationVersion: m.authorizationVersion,
    joinedAt: m.joinedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    version: m.version,
  };
}
