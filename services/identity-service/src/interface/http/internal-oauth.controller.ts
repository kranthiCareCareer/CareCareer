import * as crypto_module from 'node:crypto';

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
import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';

import type { PrismaLikeClient, TransactionClient } from '@carecareer/database';

import type { SigningKeyRepository } from '../../infrastructure/postgres-signing-key-repository.js';
import { Public } from '../../infrastructure/public.decorator.js';

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
    // Verify using scrypt with per-credential salt.
    // Hash format: "scrypt$N$r$p$salt_b64$hash_b64"
    const { scryptSync, timingSafeEqual } = crypto_module;
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }
    const [, N_str, r_str, p_str, saltB64, hashB64] = parts;
    try {
      const N = parseInt(N_str!, 10);
      const r = parseInt(r_str!, 10);
      const p = parseInt(p_str!, 10);
      const salt = Buffer.from(saltB64!, 'base64url');
      const expected = Buffer.from(hashB64!, 'base64url');
      const derived = scryptSync(provided, salt, expected.length, { N, r, p });
      return timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  /**
   * Hash a client secret using scrypt for storage.
   * Used in: seed scripts and key-rotation tooling.
   */
  static hashSecret(secret: string): string {
    const { scryptSync, randomBytes } = crypto_module;
    const salt = randomBytes(32);
    const N = 16384; const r = 8; const p = 1;
    const hash = scryptSync(secret, salt, 64, { N, r, p });
    return `scrypt$${String(N)}$${String(r)}$${String(p)}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
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
