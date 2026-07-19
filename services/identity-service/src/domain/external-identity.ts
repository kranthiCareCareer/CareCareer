/**
 * External identity domain entity.
 * Maps an external IdP identity (issuer + subject) to an internal user.
 * One user can have multiple external identities.
 * Same email from different issuers does not automatically merge.
 */
export interface ExternalIdentity {
  readonly id: string;
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly providerType: string;
  readonly emailClaim: string | null;
  readonly displayNameClaim: string | null;
  readonly lastAuthenticatedAt: Date | null;
  readonly createdAt: Date;
}

export interface LinkExternalIdentityParams {
  readonly id: string;
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly providerType: string;
  readonly emailClaim?: string | null | undefined;
  readonly displayNameClaim?: string | null | undefined;
}

/**
 * Create a new external identity link.
 */
export function createExternalIdentity(params: LinkExternalIdentityParams): ExternalIdentity {
  return {
    id: params.id,
    userId: params.userId,
    issuer: params.issuer.trim(),
    subject: params.subject.trim(),
    providerType: params.providerType,
    emailClaim: params.emailClaim?.trim().toLowerCase() ?? null,
    displayNameClaim: params.displayNameClaim?.trim() ?? null,
    lastAuthenticatedAt: null,
    createdAt: new Date(),
  };
}
