import type { Credential, CredentialStatus } from '../../../domain/credential.js';

/**
 * Credential list response DTO.
 * Never exposes credentialNumber or internal tenant/worker IDs.
 * Uses null (not undefined) for absent values — stable OpenAPI representation.
 */
export interface CredentialSummaryDto {
  id: string;
  credentialType: string;
  status: CredentialStatus;
  issuingAuthority: string | null;
  expiresAt: string | null;
  version: number;
}

/**
 * Credential detail response DTO.
 * Shows masked credential number to authorized roles only.
 */
export interface CredentialDetailDto {
  id: string;
  credentialType: string;
  status: CredentialStatus;
  issuingAuthority: string | null;
  credentialNumberMasked: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  version: number;
  createdAt: string;
}

/** Map domain entity to list summary DTO */
export function toCredentialSummaryDto(credential: Credential): CredentialSummaryDto {
  return {
    id: credential.id,
    credentialType: credential.credentialType,
    status: credential.status,
    issuingAuthority: credential.issuingAuthority ?? null,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    version: credential.version,
  };
}

/** Map domain entity to detail DTO (with masked credential number) */
export function toCredentialDetailDto(credential: Credential): CredentialDetailDto {
  return {
    id: credential.id,
    credentialType: credential.credentialType,
    status: credential.status,
    issuingAuthority: credential.issuingAuthority ?? null,
    credentialNumberMasked: maskCredentialNumber(credential.credentialNumber),
    issuedAt: credential.issuedAt?.toISOString() ?? null,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    verifiedAt: credential.verifiedAt?.toISOString() ?? null,
    version: credential.version,
    createdAt: credential.createdAt.toISOString(),
  };
}

/**
 * Mask a credential number for display.
 * Shows only last 4 characters: "****4821"
 * Returns null if no number exists.
 */
function maskCredentialNumber(number: string | undefined): string | null {
  if (!number) return null;
  if (number.length <= 4) return '****';
  return '****' + number.slice(-4);
}
