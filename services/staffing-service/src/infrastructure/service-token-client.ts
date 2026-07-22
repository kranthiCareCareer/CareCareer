import { SignJWT, importPKCS8 } from 'jose';

/**
 * Service Token Client — acquires and caches short-lived service JWTs
 * for authenticated internal service-to-service calls.
 *
 * The staffing-service uses this to authenticate itself when calling:
 * - POST /internal/v1/identity/state-validations
 * - POST /internal/v1/authorization/decisions
 *
 * Token properties:
 * - Algorithm: RS256
 * - Audience: carecareer-internal
 * - Subject: service:staffing-service
 * - Lifetime: 5 minutes
 * - Cached until 30s before expiry
 */

export interface ServiceTokenConfig {
  /** Private key PEM for signing service tokens */
  readonly privateKeyPem: string;
  /** Key ID for the service signing key */
  readonly keyId: string;
  /** Service identity (e.g., 'staffing-service') */
  readonly serviceId: string;
  /** Token lifetime in seconds (default: 300 = 5 minutes) */
  readonly lifetimeSec?: number;
}

export class ServiceTokenClient {
  private readonly config: ServiceTokenConfig;
  private cachedToken: string | null = null;
  private cachedExpiry: number = 0;

  constructor(config: ServiceTokenConfig) {
    this.config = config;
  }

  /**
   * Get a valid service token. Returns cached token if still valid,
   * otherwise generates a new one.
   */
  async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Refresh 30 seconds before expiry
    if (this.cachedToken && this.cachedExpiry > now + 30) {
      return this.cachedToken;
    }

    const lifetime = this.config.lifetimeSec ?? 300;
    const pk = await importPKCS8(this.config.privateKeyPem, 'RS256');

    const token = await new SignJWT({
      client_id: this.config.serviceId,
      token_type: 'service',
      scopes: ['identity.state.validate', 'authorization.decide'],
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.config.keyId })
      .setIssuedAt()
      .setExpirationTime(`${String(lifetime)}s`)
      .setIssuer('carecareer-identity')
      .setAudience('carecareer-internal')
      .setSubject(`service:${this.config.serviceId}`)
      .setJti(crypto.randomUUID())
      .sign(pk);

    this.cachedToken = token;
    this.cachedExpiry = now + lifetime;
    return token;
  }

  /** Invalidate the cached token (e.g., on 401 response) */
  invalidate(): void {
    this.cachedToken = null;
    this.cachedExpiry = 0;
  }
}
