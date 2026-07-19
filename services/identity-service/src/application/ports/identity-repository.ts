import type { TransactionClient } from '@carecareer/database';

import type { ExternalIdentity } from '../../domain/external-identity.js';
import type { User } from '../../domain/user.js';

/**
 * Identity repository port.
 * Implementations handle persistence of users and external identities.
 */
export interface IdentityRepository {
  // Users
  createUser(tx: TransactionClient, user: User): Promise<void>;
  findUserById(tx: TransactionClient, id: string): Promise<User | null>;
  findUserByEmail(tx: TransactionClient, email: string): Promise<User | null>;
  listUsers(
    tx: TransactionClient,
    params: ListUsersParams,
  ): Promise<{ users: User[]; total: number }>;
  updateUser(tx: TransactionClient, user: User): Promise<void>;

  // External identities
  createExternalIdentity(tx: TransactionClient, identity: ExternalIdentity): Promise<void>;
  findExternalIdentityByIssuerSubject(
    tx: TransactionClient,
    issuer: string,
    subject: string,
  ): Promise<ExternalIdentity | null>;
  listExternalIdentitiesByUserId(
    tx: TransactionClient,
    userId: string,
  ): Promise<ExternalIdentity[]>;

  // Audit
  insertAuditRecord(tx: TransactionClient, record: AuditRecord): Promise<void>;
}

export interface ListUsersParams {
  readonly offset: number;
  readonly limit: number;
  readonly status?: string | undefined;
  readonly search?: string | undefined;
  readonly orderBy?: 'created_at' | 'display_name' | undefined;
  readonly orderDir?: 'asc' | 'desc' | undefined;
}

export interface AuditRecord {
  readonly id: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly targetUserId: string;
  readonly action: string;
  readonly beforeSummary: Record<string, unknown> | null;
  readonly afterSummary: Record<string, unknown> | null;
  readonly reason: string | null;
  readonly correlationId: string;
  readonly administrativeAccess: boolean;
  readonly timestamp: Date;
}
