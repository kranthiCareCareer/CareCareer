import type { AdministrativeDatabase, TransactionClient } from '@carecareer/database';

import type { ExternalIdentity } from '../../domain/external-identity.js';
import type { User } from '../../domain/user.js';
import type { IdentityRepository, ListUsersParams } from '../ports/identity-repository.js';

/**
 * Get a user by ID.
 */
export async function getUserQuery(
  adminDb: AdministrativeDatabase,
  repo: IdentityRepository,
  userId: string,
  actorId: string,
  correlationId: string,
): Promise<User | null> {
  return adminDb.execute(
    { actorId, reason: 'Platform user lookup', correlationId },
    async (tx: TransactionClient) => {
      return repo.findUserById(tx, userId);
    },
  );
}

/**
 * List platform users with pagination, filtering, and search.
 */
export async function listUsersQuery(
  adminDb: AdministrativeDatabase,
  repo: IdentityRepository,
  params: ListUsersParams,
  actorId: string,
  correlationId: string,
): Promise<{ users: User[]; total: number }> {
  return adminDb.execute(
    { actorId, reason: 'Platform users listing', correlationId },
    async (tx: TransactionClient) => {
      return repo.listUsers(tx, params);
    },
  );
}

/**
 * List external identities for a user.
 */
export async function listExternalIdentitiesQuery(
  adminDb: AdministrativeDatabase,
  repo: IdentityRepository,
  userId: string,
  actorId: string,
  correlationId: string,
): Promise<ExternalIdentity[]> {
  return adminDb.execute(
    { actorId, reason: 'List external identities for user', correlationId },
    async (tx: TransactionClient) => {
      return repo.listExternalIdentitiesByUserId(tx, userId);
    },
  );
}
