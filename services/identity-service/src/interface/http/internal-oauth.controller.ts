import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { SignJWT, importPKCS8 } from 'jose';
import * as crypto_module from 'node:crypto';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import { Public } from '../../infrastructure/public.decorator.js';
import type { SigningKeyRepository } from '../../infrastructure/postgres-signing-key-repository.js';

/**
 * Internal OAuth Token Endpoint
 *
 * POST /internal/v1/oauth/token
 *
 * Issues short-lived service JWTs for authenticated internal services.
 * Only the identity-service signs tokens — calling services never hold signing keys.
 *
 * Supports: grant_type=client_credentials
 * Validates: registered client, credential hash, allowed scopes
 */

const TokenRequestSchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string().min(1).max(100),
  client_secret: z.string().min(1).max(500),
  scope: z.string().min(1).max(500),
}).strict();

/** Registered service clients (in production, loaded from DB/Secrets Manager) */
interface RegisteredClient {
  clientId: string;
  secretHash: string;
  allowedScopes: string[];
  active: boolean;
}

@Controller('internal/v1/oauth')
@Public()
export class InternalOAuthController {
  constructor(
    @Inject('IDENTITY_PRISMA') private readonly prisma: PrismaLikeClient,
    @Inject('SIGNING_KEY_REPOSITORY') private readonly signingKeyRepo: SigningKeyRepository,
  ) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  async issueToken(@Body() body: unknown): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  }> {
    const parsed = TokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'Invalid token request',
      });
    }

    const { client_id, client_secret, scope } = parsed.data;
    const requestedScopes = scope.split(' ').filter(Boolean);

    // Load registered client
    const client = await this.loadClient(client_id);
    if (!client || !client.active) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });
    }

    // Verify client secret (constant-time comparison)
    if (!this.verifySecret(client_secret, client.secretHash)) {
      throw new UnauthorizedException({
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });
    }

    // Verify requested scopes are allowed
    for (const s of requestedScopes) {
      if (!client.allowedScopes.includes(s)) {
        throw new BadRequestException({
          error: 'invalid_scope',
          error_description: `Scope not allowed: ${s}`,
        });
      }
    }

    // Sign the service token using the active signing key
    const token = await this.signServiceToken(client_id, requestedScopes);

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 300,
      scope: requestedScopes.join(' '),
    };
  }

  private async loadClient(clientId: string): Promise<RegisteredClient | null> {
    // Load from database (service_clients table)
    const rows = await this.prisma.$transaction(async (tx: TransactionClient) => {
      return tx.$queryRaw<{
        client_id: string;
        secret_hash: string;
        allowed_scopes: string;
        active: boolean;
      }>`
        SELECT client_id, secret_hash, allowed_scopes, active
        FROM identity.service_clients
        WHERE client_id = ${clientId}`;
    });

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      clientId: row.client_id,
      secretHash: row.secret_hash,
      allowedScopes: row.allowed_scopes.split(',').map((s) => s.trim()),
      active: row.active,
    };
  }

  private verifySecret(provided: string, storedHash: string): boolean {
    // Timing-safe comparison using Node.js crypto (ESM-compatible top-level import)
    const { createHash, timingSafeEqual } = crypto_module;
    const providedHash = createHash('sha256').update(provided).digest('hex');
    if (providedHash.length !== storedHash.length) return false;
    return timingSafeEqual(Buffer.from(providedHash), Buffer.from(storedHash));
  }

  private async signServiceToken(clientId: string, scopes: string[]): Promise<string> {
    // Get the active signing key
    const keys = await this.prisma.$transaction(async (tx: TransactionClient) => {
      return this.signingKeyRepo.getVerificationKeys(tx);
    });

    const activeKey = keys.find((k) => k.status === 'ACTIVE');
    if (!activeKey) {
      throw new Error('No active signing key available');
    }

    const privateKeyPem = activeKey.privateKeyRef;
    if (!privateKeyPem || !privateKeyPem.startsWith('inline:')) {
      throw new Error('Signing key not available for token issuance');
    }

    // For inline test keys, extract the PEM after 'inline:'
    // In production, this would call KMS
    const keyMaterial = privateKeyPem.substring(7);
    const pk = await importPKCS8(keyMaterial, 'RS256');

    const token = await new SignJWT({
      client_id: clientId,
      token_type: 'service',
      scopes,
    })
      .setProtectedHeader({ alg: 'RS256', kid: activeKey.id })
      .setIssuedAt()
      .setExpirationTime('300s')
      .setIssuer('carecareer-identity')
      .setAudience('carecareer-internal')
      .setSubject(`service:${clientId}`)
      .setJti(crypto.randomUUID())
      .sign(pk);

    return token;
  }
}
