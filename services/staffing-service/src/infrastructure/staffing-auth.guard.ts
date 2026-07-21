import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  type TokenValidator,
  type ValidatedTokenContext,
} from '@carecareer/auth';

import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Staffing-service authentication guard.
 *
 * Validates Bearer tokens using the configured TokenValidator (RS256 JWKS).
 * Attaches the validated principal to the request.
 *
 * Security guarantees:
 * - Missing token → 401
 * - Malformed token → 401
 * - Unsigned/HS256 token → 401
 * - Wrong issuer → 401
 * - Wrong audience → 401
 * - Expired token → 401
 * - Unknown kid → 401
 * - Valid token → principal attached with selectedTenantId from claims
 *
 * This guard does NOT perform live session-state validation.
 * Revocation is bounded by the 15-minute access-token lifetime.
 * See ADR-staffing-authorization-boundary.md for rationale.
 */
@Injectable()
export class StaffingAuthGuard implements CanActivate {
  constructor(
    @Inject('TOKEN_VALIDATOR') private readonly tokenValidator: TokenValidator,
    private readonly reflector: Reflector,
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

    // Extract bearer token
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

    // Validate token cryptographically (RS256 signature + claims)
    let validatedToken: ValidatedTokenContext;
    try {
      validatedToken = await this.tokenValidator.validate(token);
    } catch (error: unknown) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({
          code: 'TOKEN_EXPIRED',
          message: 'Token expired',
        });
      }
      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN',
          message: 'Invalid token',
        });
      }
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException({
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        });
      }
      throw new UnauthorizedException({
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
      });
    }

    // Attach validated principal to request
    request.principal = validatedToken;

    return true;
  }
}
