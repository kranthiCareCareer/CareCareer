import type { TransactionClient } from '@carecareer/database';

import type {
  AuditRecord,
  IdentityRepository,
  ListUsersParams,
} from '../application/ports/identity-repository.js';
import type { ExternalIdentity } from '../domain/external-identity.js';
import type { User } from '../domain/user.js';

/**
 * PostgreSQL implementation of the identity repository.
 * Operates within the identity schema.
 */
export class PostgresIdentityRepository implements IdentityRepository {
  async createUser(tx: TransactionClient, user: User): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.users (
        id, display_name, primary_email, status,
        authorization_version, created_at, updated_at, version
      ) VALUES (
        ${user.id}, ${user.displayName}, ${user.primaryEmail}, ${user.status},
        ${user.authorizationVersion}, ${user.createdAt.toISOString()},
        ${user.updatedAt.toISOString()}, ${user.version}
      )
    `;
  }

  async findUserById(tx: TransactionClient, id: string): Promise<User | null> {
    const rows = await tx.$queryRaw<UserRow>`
      SELECT id, display_name, primary_email, status,
             authorization_version, created_at, updated_at, version
      FROM identity.users WHERE id = ${id}
    `;
    if (rows.length === 0) return null;
    return mapUserRow(rows[0]!);
  }

  async findUserByEmail(tx: TransactionClient, email: string): Promise<User | null> {
    const rows = await tx.$queryRaw<UserRow>`
      SELECT id, display_name, primary_email, status,
             authorization_version, created_at, updated_at, version
      FROM identity.users WHERE primary_email = ${email}
    `;
    if (rows.length === 0) return null;
    return mapUserRow(rows[0]!);
  }

  async listUsers(
    tx: TransactionClient,
    params: ListUsersParams,
  ): Promise<{ users: User[]; total: number }> {
    // For the initial implementation, use a simpler approach with fixed queries
    // that handles the common filter cases
    let rows: UserRow[];
    let countRows: { total: number }[];

    if (params.status && params.search) {
      const search = `%${params.search}%`;
      countRows = await tx.$queryRaw<{ total: number }>`
        SELECT count(*)::int as total FROM identity.users
        WHERE status = ${params.status}
        AND (display_name ILIKE ${search} OR primary_email ILIKE ${search})
      `;
      rows = await tx.$queryRaw<UserRow>`
        SELECT id, display_name, primary_email, status,
               authorization_version, created_at, updated_at, version
        FROM identity.users
        WHERE status = ${params.status}
        AND (display_name ILIKE ${search} OR primary_email ILIKE ${search})
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `;
    } else if (params.status) {
      countRows = await tx.$queryRaw<{ total: number }>`
        SELECT count(*)::int as total FROM identity.users WHERE status = ${params.status}
      `;
      rows = await tx.$queryRaw<UserRow>`
        SELECT id, display_name, primary_email, status,
               authorization_version, created_at, updated_at, version
        FROM identity.users WHERE status = ${params.status}
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `;
    } else if (params.search) {
      const search = `%${params.search}%`;
      countRows = await tx.$queryRaw<{ total: number }>`
        SELECT count(*)::int as total FROM identity.users
        WHERE display_name ILIKE ${search} OR primary_email ILIKE ${search}
      `;
      rows = await tx.$queryRaw<UserRow>`
        SELECT id, display_name, primary_email, status,
               authorization_version, created_at, updated_at, version
        FROM identity.users
        WHERE display_name ILIKE ${search} OR primary_email ILIKE ${search}
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `;
    } else {
      countRows = await tx.$queryRaw<{ total: number }>`
        SELECT count(*)::int as total FROM identity.users
      `;
      rows = await tx.$queryRaw<UserRow>`
        SELECT id, display_name, primary_email, status,
               authorization_version, created_at, updated_at, version
        FROM identity.users
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `;
    }

    return {
      users: rows.map(mapUserRow),
      total: countRows[0]?.total ?? 0,
    };
  }

  async updateUser(tx: TransactionClient, user: User): Promise<void> {
    await tx.$executeRaw`
      UPDATE identity.users
      SET display_name = ${user.displayName},
          primary_email = ${user.primaryEmail},
          status = ${user.status},
          authorization_version = ${user.authorizationVersion},
          updated_at = ${user.updatedAt.toISOString()},
          version = ${user.version}
      WHERE id = ${user.id}
    `;
  }

  async createExternalIdentity(tx: TransactionClient, identity: ExternalIdentity): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.external_identities (
        id, user_id, issuer, subject, provider_type,
        email_claim, display_name_claim, last_authenticated_at, created_at
      ) VALUES (
        ${identity.id}, ${identity.userId}, ${identity.issuer}, ${identity.subject},
        ${identity.providerType}, ${identity.emailClaim}, ${identity.displayNameClaim},
        ${identity.lastAuthenticatedAt?.toISOString() ?? null}, ${identity.createdAt.toISOString()}
      )
    `;
  }

  async findExternalIdentityByIssuerSubject(
    tx: TransactionClient,
    issuer: string,
    subject: string,
  ): Promise<ExternalIdentity | null> {
    const rows = await tx.$queryRaw<ExternalIdentityRow>`
      SELECT id, user_id, issuer, subject, provider_type,
             email_claim, display_name_claim, last_authenticated_at, created_at
      FROM identity.external_identities
      WHERE issuer = ${issuer} AND subject = ${subject}
    `;
    if (rows.length === 0) return null;
    return mapExternalIdentityRow(rows[0]!);
  }

  async listExternalIdentitiesByUserId(
    tx: TransactionClient,
    userId: string,
  ): Promise<ExternalIdentity[]> {
    const rows = await tx.$queryRaw<ExternalIdentityRow>`
      SELECT id, user_id, issuer, subject, provider_type,
             email_claim, display_name_claim, last_authenticated_at, created_at
      FROM identity.external_identities
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;
    return rows.map(mapExternalIdentityRow);
  }

  async insertAuditRecord(tx: TransactionClient, record: AuditRecord): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO identity.audit_records (
        id, actor_id, actor_type, target_user_id, action,
        before_summary, after_summary, reason,
        correlation_id, administrative_access, timestamp
      ) VALUES (
        ${record.id}, ${record.actorId}, ${record.actorType},
        ${record.targetUserId}, ${record.action},
        ${record.beforeSummary ? JSON.stringify(record.beforeSummary) : null}::jsonb,
        ${record.afterSummary ? JSON.stringify(record.afterSummary) : null}::jsonb,
        ${record.reason}, ${record.correlationId},
        ${record.administrativeAccess}, ${record.timestamp.toISOString()}
      )
    `;
  }
}

// ─── Row Mappers ───────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  display_name: string;
  primary_email: string;
  status: string;
  authorization_version: number;
  created_at: string | Date;
  updated_at: string | Date;
  version: number;
}

interface ExternalIdentityRow {
  id: string;
  user_id: string;
  issuer: string;
  subject: string;
  provider_type: string;
  email_claim: string | null;
  display_name_claim: string | null;
  last_authenticated_at: string | Date | null;
  created_at: string | Date;
}

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    primaryEmail: row.primary_email,
    status: row.status as 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED',
    authorizationVersion: row.authorization_version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    version: row.version,
  };
}

function mapExternalIdentityRow(row: ExternalIdentityRow): ExternalIdentity {
  return {
    id: row.id,
    userId: row.user_id,
    issuer: row.issuer,
    subject: row.subject,
    providerType: row.provider_type,
    emailClaim: row.email_claim,
    displayNameClaim: row.display_name_claim,
    lastAuthenticatedAt: row.last_authenticated_at ? new Date(row.last_authenticated_at) : null,
    createdAt: new Date(row.created_at),
  };
}
