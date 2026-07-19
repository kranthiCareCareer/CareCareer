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
  Query,
  Req,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '@carecareer/auth';
import type { AdministrativeDatabase } from '@carecareer/database';

import { changeUserStatusCommand } from '../../application/commands/change-user-status.command.js';
import { createUserCommand } from '../../application/commands/create-user.command.js';
import { linkExternalIdentityCommand } from '../../application/commands/link-external-identity.command.js';
import {
  ChangeUserStatusSchema,
  CreateUserSchema,
  LinkExternalIdentitySchema,
  ListUsersQuerySchema,
} from '../../application/dto/request-schemas.js';
import type { IdentityRepository } from '../../application/ports/identity-repository.js';
import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
} from '../../application/ports/injection-tokens.js';
import {
  getUserQuery,
  listExternalIdentitiesQuery,
  listUsersQuery,
} from '../../application/queries/user-queries.js';
import {
  DuplicateExternalIdentityError,
  DuplicateUserError,
  InvalidStatusTransitionError,
  UserNotFoundError,
  VersionConflictError,
} from '../../domain/errors.js';
import { RequirePermission } from '../../infrastructure/permission.decorator.js';

/**
 * Platform user management endpoints.
 * All endpoints require authentication and platform admin permission.
 */
@Controller('v1/platform/users')
export class UserController {
  constructor(
    @Inject(ADMINISTRATIVE_DATABASE) private readonly adminDb: AdministrativeDatabase,
    @Inject(IDENTITY_REPOSITORY) private readonly repo: IdentityRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('platform.users.manage')
  async createUser(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        errors: parsed.error.issues,
      });
    }

    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const user = await createUserCommand(this.adminDb, this.repo, {
        displayName: parsed.data.displayName,
        primaryEmail: parsed.data.primaryEmail,
        actorId,
        correlationId: corrId,
      });

      return {
        data: {
          id: user.id,
          displayName: user.displayName,
          primaryEmail: user.primaryEmail,
          status: user.status,
          authorizationVersion: user.authorizationVersion,
          createdAt: user.createdAt.toISOString(),
          version: user.version,
        },
      };
    } catch (error: unknown) {
      if (error instanceof DuplicateUserError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  @Get()
  @RequirePermission('platform.users.read')
  async listUsers(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Query() query: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown[]; pagination: unknown }> {
    const parsed = ListUsersQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        errors: parsed.error.issues,
      });
    }

    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const { users, total } = await listUsersQuery(
      this.adminDb,
      this.repo,
      parsed.data,
      actorId,
      corrId,
    );

    return {
      data: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        primaryEmail: u.primaryEmail,
        status: u.status,
        authorizationVersion: u.authorizationVersion,
        createdAt: u.createdAt.toISOString(),
        version: u.version,
      })),
      pagination: {
        offset: parsed.data.offset,
        limit: parsed.data.limit,
        total,
      },
    };
  }

  @Get(':userId')
  @RequirePermission('platform.users.read')
  async getUser(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('userId') userId: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const user = await getUserQuery(this.adminDb, this.repo, userId, actorId, corrId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: `User not found: ${userId}` });
    }

    return {
      data: {
        id: user.id,
        displayName: user.displayName,
        primaryEmail: user.primaryEmail,
        status: user.status,
        authorizationVersion: user.authorizationVersion,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        version: user.version,
      },
    };
  }

  @Patch(':userId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('platform.users.manage')
  async changeStatus(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const parsed = ChangeUserStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        errors: parsed.error.issues,
      });
    }

    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const user = await changeUserStatusCommand(this.adminDb, this.repo, {
        userId,
        targetStatus: parsed.data.status,
        expectedVersion: parsed.data.version,
        reason: parsed.data.reason,
        actorId,
        correlationId: corrId,
      });

      return {
        data: {
          id: user.id,
          displayName: user.displayName,
          status: user.status,
          authorizationVersion: user.authorizationVersion,
          updatedAt: user.updatedAt.toISOString(),
          version: user.version,
        },
      };
    } catch (error: unknown) {
      if (error instanceof UserNotFoundError) {
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

  @Post(':userId/external-identities')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('platform.users.manage')
  async linkExternalIdentity(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const parsed = LinkExternalIdentitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        errors: parsed.error.issues,
      });
    }

    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const identity = await linkExternalIdentityCommand(this.adminDb, this.repo, {
        userId,
        issuer: parsed.data.issuer,
        subject: parsed.data.subject,
        providerType: parsed.data.providerType,
        emailClaim: parsed.data.emailClaim,
        displayNameClaim: parsed.data.displayNameClaim,
        actorId,
        correlationId: corrId,
      });

      return {
        data: {
          id: identity.id,
          userId: identity.userId,
          issuer: identity.issuer,
          subject: identity.subject,
          providerType: identity.providerType,
          createdAt: identity.createdAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException({ code: error.code, message: error.message });
      }
      if (error instanceof DuplicateExternalIdentityError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  @Get(':userId/external-identities')
  @RequirePermission('platform.users.read')
  async listExternalIdentities(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('userId') userId: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ data: unknown[] }> {
    if (!isValidUuid(userId)) {
      throw new BadRequestException({ code: 'INVALID_UUID', message: 'Invalid user ID format' });
    }

    const actorId = req.principal?.actorId ?? 'unknown';
    const corrId = correlationId ?? crypto.randomUUID();

    const identities = await listExternalIdentitiesQuery(
      this.adminDb,
      this.repo,
      userId,
      actorId,
      corrId,
    );

    return {
      data: identities.map((i) => ({
        id: i.id,
        userId: i.userId,
        issuer: i.issuer,
        subject: i.subject,
        providerType: i.providerType,
        emailClaim: i.emailClaim,
        displayNameClaim: i.displayNameClaim,
        lastAuthenticatedAt: i.lastAuthenticatedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
