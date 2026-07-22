/**
 * Service Credential Provider — abstraction for obtaining service credentials.
 *
 * Current: LocalClientCredentialsProvider (client-credentials token exchange)
 * Future: AwsSigV4WorkloadCredentialProvider (ECS task role + SigV4)
 *
 * The identity-state and authorization adapters don't know whether
 * the caller used a client secret, client assertion, or SigV4.
 */

export interface ServiceCredential {
  readonly token: string;
  readonly expiresAt: number; // Unix timestamp
}

export interface ServiceCredentialProvider {
  getCredential(): Promise<ServiceCredential>;
  invalidate(): void;
}

/**
 * Client-credentials token exchange provider.
 *
 * The staffing-service authenticates to the identity-service's token endpoint.
 * The identity-service signs and issues a short-lived service JWT.
 * The staffing-service NEVER holds the identity issuer's signing key.
 *
 * Config: IDENTITY_SERVICE_URL + CLIENT_ID + CLIENT_SECRET
 */
export class LocalClientCredentialsProvider implements ServiceCredentialProvider {
  private readonly tokenEndpoint: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scopes: string;
  private cached: ServiceCredential | null = null;

  constructor(config: {
    identityServiceUrl: string;
    clientId: string;
    clientSecret: string;
    scopes?: string;
  }) {
    this.tokenEndpoint = `${config.identityServiceUrl.replace(/\/$/, '')}/internal/v1/oauth/token`;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.scopes = config.scopes ?? 'identity.state.validate authorization.decide';
  }

  async getCredential(): Promise<ServiceCredential> {
    const now = Math.floor(Date.now() / 1000);
    // Use cached token if valid (with 30s buffer)
    if (this.cached && this.cached.expiresAt > now + 30) {
      return this.cached;
    }

    // Exchange client credentials for a service token
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: this.scopes,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(
        `Token exchange failed: ${(err['error_description'] as string) ?? response.status}`,
      );
    }

    const body = await response.json() as {
      access_token: string;
      expires_in: number;
    };

    this.cached = {
      token: body.access_token,
      expiresAt: now + body.expires_in,
    };

    return this.cached;
  }

  invalidate(): void {
    this.cached = null;
  }
}
