import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify, createLocalJWKSet, type JWTPayload, decodeProtectedHeader } from 'jose';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import type { SigningKeyRepository } from './postgres-signing-key-repository.js';

export const REQUIRED_SERVICE_SCOPE_KEY = 'requiredServiceScope';

/** Decorator to declare required service scope on internal endpoints */
export const RequireServiceScope = (scope: string): MethodDecorator =>
  SetMetadata(REQUIRED_SERVICE_SCOPE_KEY, scope);

/**
 * Service Identity Guard for internal endpoints.
 *
 * Validates:
 * 1. RS256 signature (using identity-service signing keys)
 * 2. Audience: carecareer-internal
 * 3. token_type: service
 * 4. Caller service identity (sub = service:xxx)
 * 5. Required service scope
 * 6. Token not expired
 * 7. Client still active (DB check)
 */
@Injectable()
export class ServiceIdentityGuard implements CanActivate {
  constructor(
    @Inject('IDENTITY_PRISMA') private readonly prisma: PrismaLikeClient,
    @Inject('SIGNING_KEY_REPOSITORY') private readonly signingKeyRepo: SigningKeyRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      serviceIdentity?: { clientId: string; scopes: string[] };
    }>();

    // Extract bearer token
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'invalid_token',
        error_description: 'Service authentication required',
      });
    }

    const token = authHeader.slice(7);
    if (!token) {
      throw new UnauthorizedException({
        error: 'invalid_token',
        error_description: 'Token missing',
      });
    }

    // Decode header and verify algorithm
    let header: { alg?: string; kid?: string };
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new UnauthorizedException({ error: 'invalid_token', error_description: 'Malformed token' });
    }

    if (header.alg !== 'RS256') {
      throw new UnauthorizedException({ error: 'invalid_token', error_description: 'Unsupported algorithm' });
    }

    // Load signing keys and verify
    const keys = await this.prisma.$transaction(async (tx: TransactionClient) => {
      return this.signingKeyRepo.getVerificationKeys(tx);
    });

    const jwkEntries = [];
    for (const key of keys) {
      const { createPublicKey } = await import('node:crypto');
      const { exportJWK } = await import('jose');
      const pubKey = createPublicKey(key.publicKey);
      const jwk = await exportJWK(pubKey);
      jwkEntries.push({ ...jwk, kid: key.id, use: 'sig', alg: 'RS256' });
    }

    const jwkSet = createLocalJWKSet({ keys: jwkEntries });

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, jwkSet, {
        issuer: 'carecareer-identity',
        audience: 'carecareer-internal',
        algorithms: ['RS256'],
        clockTolerance: 30,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException({ error: 'invalid_token', error_description: 'Token verification failed' });
    }

    // Verify token_type = service
    if (payload['token_type'] !== 'service') {
      throw new UnauthorizedException({ error: 'invalid_token', error_description: 'Not a service token' });
    }

    // Verify subject format
    const sub = payload.sub;
    if (!sub || !sub.startsWith('service:')) {
      throw new UnauthorizedException({ error: 'invalid_token', error_description: 'Invalid service identity' });
    }

    const clientId = payload['client_id'] as string;
    if (!clientId) {
      throw new UnauthorizedException({ error: 'invalid_token', error_description: 'Missing client_id' });
    }

    // Verify client still active
    const clientActive = await this.isClientActive(clientId);
    if (!clientActive) {
      throw new UnauthorizedException({ error: 'invalid_client', error_description: 'Client disabled' });
    }

    // Check required scope
    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_SERVICE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const tokenScopes = (payload['scopes'] as string[]) ?? [];
    if (requiredScope && !tokenScopes.includes(requiredScope)) {
      throw new ForbiddenException({
        error: 'insufficient_scope',
        error_description: `Required scope: ${requiredScope}`,
      });
    }

    // Attach service identity to request
    request.serviceIdentity = { clientId, scopes: tokenScopes };
    return true;
  }

  private async isClientActive(clientId: string): Promise<boolean> {
    const rows = await this.prisma.$transaction(async (tx: TransactionClient) => {
      return tx.$queryRaw<Array<{ active: boolean }>>`
        SELECT active FROM identity.service_clients WHERE client_id = ${clientId}`;
    });
    return rows.length > 0 && rows[0]!.active;
  }
}
