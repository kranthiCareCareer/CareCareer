import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticationError, type TokenValidator } from '@carecareer/auth';

import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { SessionStateValidator } from './session-state-validator.js';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

/**
 * Authentication + permission guard for identity-service.
 * - Validates JWT (production RS256 or demo HS256 in dev)
 * - Checks @Public() to skip auth
 * - Checks live session state against PostgreSQL (when validator available)
 * - Checks @RequirePermission() for authorization
 *
 * Session-state enforcement:
 * - Revoked session → AUTH_SESSION_REVOKED (immediate)
 * - Compromised session → AUTH_SESSION_COMPROMISED (immediate)
 * - Expired session → AUTH_SESSION_EXPIRED (immediate)
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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: unknown;
    }>();

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

    try {
      const principal = await this.tokenValidator.validate(token);
      request.principal = principal;

      // Live session-state enforcement (identity-service only)
      if (this.sessionValidator) {
        // Extract session ID from principal claims if available
        // The platform token validator embeds 'sid' which is part of the token
        // but the principal interface doesn't expose it directly.
        // We access it through the raw token re-decode or a separate path.
        // For now, extract sid from the token payload directly.
        const sid = this.extractSessionId(token);
        if (sid) {
          const sessionResult = await this.sessionValidator.validate({
            sessionId: sid,
            userId: principal.subject,
          });
          if (!sessionResult.valid) {
            throw new UnauthorizedException({
              code: sessionResult.code ?? 'AUTH_SESSION_INVALID',
              message: sessionResult.message ?? 'Session invalid',
            });
          }
        }
      }

      // Check permission if required
      const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(
        REQUIRED_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (requiredPermission) {
        const hasPlatformAdmin = principal.tenantMemberships.some(
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
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException({ code: 'AUTH_FAILED', message: error.message });
      }
      throw new UnauthorizedException({ code: 'AUTH_FAILED', message: 'Authentication failed' });
    }
  }

  /**
   * Extract the session ID (sid claim) from a JWT without full verification.
   * The token was already verified by tokenValidator — safe to decode payload.
   */
  private extractSessionId(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      const sid = payload['sid'];
      return typeof sid === 'string' ? sid : null;
    } catch {
      return null;
    }
  }
}
