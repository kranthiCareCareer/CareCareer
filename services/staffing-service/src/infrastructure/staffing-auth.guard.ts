import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  type TokenValidator,
  type ValidatedTokenContext,
} from '@carecareer/auth';

import type { IdentityStateAdapter } from './identity-state-adapter.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Staffing-service authentication guard.
 *
 * Two-phase validation:
 * 1. RS256 cryptographic token validation (issuer, audience, expiry, kid, signature)
 * 2. Current identity state validation (session active, user active, membership active,
 *    authorization versions current)
 *
 * Security guarantees:
 * - Missing token → 401
 * - Malformed/unsigned/HS256/expired/wrong-issuer/wrong-audience → 401
 * - Revoked session → 401 (immediate, not 15-minute delay)
 * - Inactive user → 401
 * - Inactive membership → 401
 * - Stale user authorization version → 401
 * - Stale membership authorization version → 401
 * - Identity service unreachable → 401 (fail closed)
 * - Valid token + active state → principal attached
 */
@Injectable()
export class StaffingAuthGuard implements CanActivate {
  constructor(
    @Inject('TOKEN_VALIDATOR') private readonly tokenValidator: TokenValidator,
    private readonly reflector: Reflector,
    @Optional() @Inject('IDENTITY_STATE_ADAPTER') private readonly identityAdapter?: IdentityStateAdapter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Public route bypass (health/readiness)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: ValidatedTokenContext;
    }>();

    // Phase 1: Extract and validate bearer token (RS256)
    const validatedToken = await this.validateToken(request.headers);

    // Phase 2: Validate current identity state (session, user, membership)
    if (this.identityAdapter) {
      const stateResult = await this.identityAdapter.validate({
        sessionId: validatedToken.sessionId,
        userId: validatedToken.subject,
        selectedTenantId: validatedToken.selectedTenantId,
        membershipId: validatedToken.membershipId,
        userAuthorizationVersion: validatedToken.userAuthorizationVersion,
        membershipAuthorizationVersion: validatedToken.membershipAuthorizationVersion,
      });

      if (!stateResult.valid) {
        throw new UnauthorizedException({
          code: stateResult.code ?? 'IDENTITY_STATE_INVALID',
          message: stateResult.message ?? 'Identity state validation failed',
        });
      }
    }

    // Attach validated principal to request
    request.principal = validatedToken;
    return true;
  }

  private async validateToken(
    headers: Record<string, string | undefined>,
  ): Promise<ValidatedTokenContext> {
    const authHeader = headers['authorization'];
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
        message: 'Invalid authorization format. Expected: Bearer <token>',
      });
    }

    const token = parts[1];
    if (!token) {
      throw new UnauthorizedException({
        code: 'TOKEN_MISSING',
        message: 'Token missing',
      });
    }

    try {
      return await this.tokenValidator.validate(token);
    } catch (error: unknown) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({ code: 'TOKEN_EXPIRED', message: 'Token expired' });
      }
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token' });
      }
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException({ code: 'AUTH_FAILED', message: 'Authentication failed' });
      }
      throw new UnauthorizedException({ code: 'AUTH_FAILED', message: 'Authentication failed' });
    }
  }
}
