import type { TransactionClient } from '@carecareer/database';

import type { Credential } from '../../domain/credential.js';

/**
 * Credential repository port.
 * All queries execute within a tenant-scoped transaction (RLS enforced).
 */
export interface CredentialRepository {
  createCredential(tx: TransactionClient, credential: Credential): Promise<void>;
  getCredentialById(tx: TransactionClient, credentialId: string): Promise<Credential | null>;
  getCredentialsByWorkerId(tx: TransactionClient, workerId: string): Promise<Credential[]>;
  updateCredential(tx: TransactionClient, credential: Credential): Promise<void>;
}
