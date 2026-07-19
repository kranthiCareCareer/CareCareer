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

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';

/**
 * Authentication + permission guard for identity-service.
 * - Validates JWT (demo adapter in dev, OIDC in production)
 * - Checks @Public() to skip auth
 * - Checks @RequirePermission() for authorization
 *
 * Until GP-03.3 provides real platform tokens, uses an explicit test/demo
 * authorization adapter that cannot start in production.
 */
@Injectable()
export class IdentityAuthGuard implements CanActivate {
  private readonly tokenValidator: TokenValidator;
  private readonly reflector: Reflector;

  constructor(tokenValidator: TokenValidator, reflector: Reflector) {
    this.tokenValidator = tokenValidator;
    this.reflector = reflector;
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
}
