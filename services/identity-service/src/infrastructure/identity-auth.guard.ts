import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  AuthenticationError,
  type TokenValidator,
  type ValidatedTokenContext,
} from '@carecareer/auth';

import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { SessionStateValidator } from './session-state-validator.js';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

/**
 * Authentication + session-state + permission guard for identity-service.
 *
 * Orchestrates:
 * 1. Route metadata (public bypass)
 * 2. Token validation (returns ValidatedTokenContext — no JWT reparsing)
 * 3. Live session-state validation (PostgreSQL)
 * 4. Permission checking
 * 5. Principal attachment to request
 *
 * Session-state enforcement:
 * - REVOKED → AUTH_SESSION_REVOKED (immediate)
 * - COMPROMISED → AUTH_SESSION_COMPROMISED (immediate)
 * - EXPIRED → AUTH_SESSION_EXPIRED (immediate)
 *
 * Revocation guarantee:
 * Identity-service endpoints using live session validation reject revoked
 * sessions immediately. Services performing only offline JWT validation
 * remain bounded by the 15-minute access-token lifetime.
 */
@Injectable()
export class IdentityAuthGuard implements CanActivate {
  private readonly tokenValidator: TokenValidator;
  private readonly reflector: Reflector;
  private readonly sessionValidator: SessionStateValidator | null;

  constructor(
    tokenValidator: TokenValidator,
    reflector: Reflector,
    sessionValidator?: SessionStateValidator | null,
  ) {
    this.tokenValidator = tokenValidator;
    this.reflector = reflector;
    this.sessionValidator = sessionValidator ?? null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Step 1: Public route bypass
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: unknown;
    }>();

    // Step 2: Extract bearer token
    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException({
        code: 'INVALID_AUTH_FORMAT',
        message: 'Invalid authorization format',
      });
    }

    const token = parts[1];
    if (!token) {
      throw new UnauthorizedException({ code: 'TOKEN_MISSING', message: 'Token missing' });
    }

    // Step 3: Validate token (returns typed ValidatedTokenContext)
    let validatedToken: ValidatedTokenContext;
    try {
      validatedToken = await this.tokenValidator.validate(token);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException({ code: 'AUTH_FAILED', message: error.message });
      }
      throw new UnauthorizedException({ code: 'AUTH_FAILED', message: 'Authentication failed' });
    }

    // Step 4: Live session-state enforcement
    if (this.sessionValidator && validatedToken.sessionId) {
      const sessionResult = await this.sessionValidator.validate({
        sessionId: validatedToken.sessionId,
        userId: validatedToken.subject,
        userAuthorizationVersion: validatedToken.userAuthorizationVersion,
        membershipAuthorizationVersion: validatedToken.membershipAuthorizationVersion,
      });
      if (!sessionResult.valid) {
        throw new UnauthorizedException({
          code: sessionResult.code ?? 'AUTH_SESSION_INVALID',
          message: sessionResult.message ?? 'Session invalid',
        });
      }
    }

    // Step 5: Attach principal to request
    request.principal = validatedToken;

    // Step 6: Permission check
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermission) {
      const hasPlatformAdmin = validatedToken.tenantMemberships.some(
        (m) => m.roles.includes('PLATFORM_ADMIN') && m.status === 'active',
      );
      if (!hasPlatformAdmin) {
        throw new ForbiddenException({
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Permission required: ${requiredPermission}`,
        });
      }
    }

    return true;
  }
}
