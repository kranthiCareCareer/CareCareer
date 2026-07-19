/**
 * Signing key domain entity.
 * Manages RSA/EC key pairs for platform JWT issuance.
 *
 * Key lifecycle:
 *   ACTIVE — current key used for signing
 *   ROTATED — previous key, still valid for verification (24h overlap)
 *   REVOKED — permanently disabled
 *
 * Rules:
 * - Only one ACTIVE key at a time
 * - Issuance uses only the ACTIVE key
 * - Verification accepts ACTIVE + ROTATED keys
 * - REVOKED keys are never used
 */
export interface SigningKey {
  readonly id: string;
  readonly algorithm: 'RS256' | 'ES256';
  readonly publicKey: string;
  readonly privateKeyRef: string;
  readonly status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
  readonly activatedAt: Date | null;
  readonly rotatedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateSigningKeyParams {
  readonly id: string;
  readonly algorithm: 'RS256' | 'ES256';
  readonly publicKey: string;
  readonly privateKeyRef: string;
}

export function createSigningKey(params: CreateSigningKeyParams): SigningKey {
  return {
    id: params.id,
    algorithm: params.algorithm,
    publicKey: params.publicKey,
    privateKeyRef: params.privateKeyRef,
    status: 'ACTIVE',
    activatedAt: new Date(),
    rotatedAt: null,
    createdAt: new Date(),
  };
}

export function rotateSigningKey(key: SigningKey): SigningKey {
  return {
    ...key,
    status: 'ROTATED',
    rotatedAt: new Date(),
  };
}

export function revokeSigningKey(key: SigningKey): SigningKey {
  return {
    ...key,
    status: 'REVOKED',
  };
}
