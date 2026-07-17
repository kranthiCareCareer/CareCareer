import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { TokenValidator } from '@carecareer/auth';
import { AuthenticationError } from '@carecareer/auth';

/**
 * Guard that validates JWT tokens and populates the authenticated principal.
 * Uses the TokenValidator interface — provider-neutral (Auth0/Cognito/Keycloak).
 *
 * Fails with 401 if:
 * - No Authorization header
 * - Token is not Bearer format
 * - Token validation fails (expired, invalid signature, wrong issuer/audience)
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly tokenValidator: TokenValidator;

  constructor(tokenValidator: TokenValidator) {
    this.tokenValidator = tokenValidator;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: unknown;
    }>();

    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Authentication required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid authorization format');
    }

    const token = parts[1];
    if (!token) {
      throw new UnauthorizedException('Token missing');
    }

    try {
      const principal = await this.tokenValidator.validate(token);
      request.principal = principal;
      return true;
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        // Never include token value in error response
        throw new UnauthorizedException(error.message);
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
