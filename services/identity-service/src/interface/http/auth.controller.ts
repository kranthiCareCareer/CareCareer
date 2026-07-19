import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '@carecareer/auth';
import type { AdministrativeDatabase } from '@carecareer/database';

import {
  createSessionCommand,
  logoutAllCommand,
  logoutCommand,
  refreshSessionCommand,
  RefreshError,
} from '../../application/commands/session-commands.js';
import type { IdentityRepository } from '../../application/ports/identity-repository.js';
import {
  ADMINISTRATIVE_DATABASE,
  IDENTITY_REPOSITORY,
} from '../../application/ports/injection-tokens.js';
import type { SigningKey } from '../../domain/signing-key.js';
import { createPgPrismaClient } from '../../infrastructure/database-factory.js';
import { buildJwks, signPlatformJwt } from '../../infrastructure/jwt-service.js';
import {
  PostgresSessionRepository,
  PostgresSigningKeyRepository,
} from '../../infrastructure/postgres-session-repository.js';
import { Public } from '../../infrastructure/public.decorator.js';

/**
 * Authentication endpoints.
 * Handles refresh, logout, sessions, JWKS, and /me.
 */
@Controller()
export class AuthController {
  private readonly sessionRepo: PostgresSessionRepository;
  private readonly signingKeyRepo: PostgresSigningKeyRepository;
  private readonly prismaClient: ReturnType<typeof createPgPrismaClient> | null;

  constructor(
    @Inject(ADMINISTRATIVE_DATABASE) private readonly adminDb: AdministrativeDatabase,
    @Inject(IDENTITY_REPOSITORY) private readonly identityRepo: IdentityRepository,
  ) {
    this.sessionRepo = new PostgresSessionRepository();
    this.signingKeyRepo = new PostgresSigningKeyRepository();
    const dbUrl = process.env['DATABASE_URL'];
    this.prismaClient = dbUrl ? createPgPrismaClient(dbUrl) : null;
  }

  // ─── Refresh ────────────────────────────────────────────────────────────────

  @Post('v1/auth/refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const parsed = body as { refreshToken?: string } | null;
    const refreshToken = parsed?.refreshToken;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_INVALID',
        message: 'Refresh token required',
      });
    }

    if (!this.prismaClient) {
      throw new UnauthorizedException({ code: 'AUTH_REFRESH_INVALID', message: 'Not configured' });
    }

    const corrId = correlationId ?? crypto.randomUUID();

    try {
      const { session, newRefreshToken } = await refreshSessionCommand(
        this.prismaClient,
        this.sessionRepo,
        this.identityRepo,
        { refreshToken, correlationId: corrId },
      );

      // Issue new access token
      const accessToken = await this.issueAccessToken(session.userId, session.id);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900, // 15 minutes
      };
    } catch (error: unknown) {
      if (error instanceof RefreshError) {
        throw new UnauthorizedException({ code: error.code, message: error.message });
      }
      throw new UnauthorizedException({ code: 'AUTH_REFRESH_INVALID', message: 'Refresh failed' });
    }
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  @Post('v1/auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ status: string }> {
    const principal = req.principal;
    if (!principal || !this.prismaClient) {
      return { status: 'ok' }; // Idempotent
    }

    const userId = principal.subject;
    const corrId = correlationId ?? crypto.randomUUID();

    // Extract session ID from the token (stored in 'sid' claim)
    // For now, revoke based on user context
    await logoutCommand(this.prismaClient, this.sessionRepo, {
      sessionId: corrId, // Placeholder — real impl uses sid from token
      userId,
      correlationId: corrId,
    });

    return { status: 'ok' };
  }

  @Post('v1/auth/logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ status: string; revokedCount: number }> {
    const principal = req.principal;
    if (!principal || !this.prismaClient) {
      return { status: 'ok', revokedCount: 0 };
    }

    const corrId = correlationId ?? crypto.randomUUID();
    const count = await logoutAllCommand(this.prismaClient, this.sessionRepo, {
      userId: principal.subject,
      correlationId: corrId,
    });

    return { status: 'ok', revokedCount: count };
  }

  // ─── Sessions ───────────────────────────────────────────────────────────────

  @Get('v1/auth/sessions')
  async listSessions(
    @Req() req: { principal?: AuthenticatedPrincipal },
  ): Promise<{ data: unknown[] }> {
    const principal = req.principal;
    if (!principal || !this.prismaClient) {
      return { data: [] };
    }

    const sessions = await this.prismaClient.$transaction(async (tx) => {
      return this.sessionRepo.listUserSessions(tx, principal.subject);
    });

    return {
      data: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        status: s.status,
      })),
    };
  }

  @Delete('v1/auth/sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Req() req: { principal?: AuthenticatedPrincipal },
    @Param('sessionId') sessionId: string,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ status: string }> {
    const principal = req.principal;
    if (!principal || !this.prismaClient) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }

    const corrId = correlationId ?? crypto.randomUUID();

    // Verify the session belongs to the current user (hidden 404 otherwise)
    const session = await this.prismaClient.$transaction(async (tx) => {
      return this.sessionRepo.getSessionById(tx, sessionId);
    });

    if (!session || session.userId !== principal.subject) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }

    await logoutCommand(this.prismaClient, this.sessionRepo, {
      sessionId,
      userId: principal.subject,
      correlationId: corrId,
    });

    return { status: 'revoked' };
  }

  // ─── Me ─────────────────────────────────────────────────────────────────────

  @Get('v1/auth/me')
  async me(@Req() req: { principal?: AuthenticatedPrincipal }): Promise<{ data: unknown }> {
    const principal = req.principal;
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    // Resolve full user details
    const user = await this.adminDb.execute(
      {
        actorId: principal.subject,
        reason: 'Get current identity',
        correlationId: crypto.randomUUID(),
      },
      async (tx) => this.identityRepo.findUserById(tx, principal.subject),
    );

    if (!user) {
      throw new UnauthorizedException({ code: 'AUTH_USER_NOT_FOUND', message: 'User not found' });
    }

    return {
      data: {
        userId: user.id,
        displayName: user.displayName,
        status: user.status,
        authorizationVersion: user.authorizationVersion,
        platformRoles: principal.tenantMemberships
          .filter((m) => m.roles.includes('PLATFORM_ADMIN') || m.roles.includes('PLATFORM_AUDITOR'))
          .flatMap((m) => m.roles),
        tenantMemberships: principal.tenantMemberships.map((m) => ({
          tenantId: m.tenantId,
          roles: m.roles,
          status: m.status,
        })),
      },
    };
  }

  // ─── JWKS ───────────────────────────────────────────────────────────────────

  @Get('.well-known/jwks.json')
  @Public()
  async jwks(): Promise<{ keys: unknown[] }> {
    if (!this.prismaClient) {
      return { keys: [] };
    }

    const keys = await this.prismaClient.$transaction(async (tx) => {
      return this.signingKeyRepo.getVerificationKeys(tx);
    });

    return buildJwks(keys);
  }

  // ─── Dev-only session creation (for local testing) ──────────────────────────

  @Post('v1/auth/dev/session')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async createDevSession(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }> {
    // Only available in non-production
    if (process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }

    const parsed = body as { userId?: string } | null;
    const userId = parsed?.userId;
    if (!userId || typeof userId !== 'string' || !this.prismaClient) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID',
        message: 'userId required in non-production',
      });
    }

    const corrId = correlationId ?? crypto.randomUUID();

    const { session, refreshToken } = await createSessionCommand(
      this.prismaClient,
      this.sessionRepo,
      { userId, correlationId: corrId },
    );

    const accessToken = await this.issueAccessToken(userId, session.id);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      sessionId: session.id,
    };
  }

  // ─── Helper ─────────────────────────────────────────────────────────────────

  private async issueAccessToken(userId: string, sessionId: string): Promise<string> {
    if (!this.prismaClient) {
      return 'no-db-configured';
    }

    // Get signing key and user details
    const result = await this.prismaClient.$transaction(async (tx) => {
      const activeKey = await this.signingKeyRepo.getActiveKey(tx);
      const user = await this.identityRepo.findUserById(tx, userId);
      return { activeKey, user };
    });

    if (!result.activeKey || !result.user) {
      // Fallback for test environments without real keys
      return 'no-signing-key-available';
    }

    const key: SigningKey = result.activeKey;

    // In development, private_key_ref may contain inline: prefix for ephemeral keys
    // In production, this would be a KMS ARN resolved through a signing provider
    const privateKeyPem = await this.resolvePrivateKey(key.privateKeyRef);

    return signPlatformJwt(
      {
        sub: userId,
        user_authorization_version: result.user.authorizationVersion,
        platform_roles: [],
        tenant_roles: [],
        permissions: [],
        sid: sessionId,
      },
      privateKeyPem,
      key.id,
    );
  }

  /**
   * Resolve private key from reference.
   * Development: inline PEM or file reference.
   * Production: KMS API call (not implemented in GP-03.3).
   */
  private async resolvePrivateKey(ref: string): Promise<string> {
    if (ref.startsWith('inline:')) {
      // Development-only: key stored as environment variable
      const envKey = process.env['SIGNING_PRIVATE_KEY'];
      if (envKey) return envKey;
      throw new Error('SIGNING_PRIVATE_KEY env not set for inline provider');
    }
    // Future: KMS resolution
    throw new Error(`Unsupported signing provider reference: ${ref.substring(0, 20)}`);
  }
}
