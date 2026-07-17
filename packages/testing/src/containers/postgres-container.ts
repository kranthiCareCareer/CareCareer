import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

/**
 * Manages a PostgreSQL Testcontainer with RLS-enabled schema.
 * Used for integration tests proving tenant isolation, outbox atomicity,
 * pooled-connection safety, and idempotency concurrency.
 */
export class PostgresTestContainer {
  private container: StartedPostgreSqlContainer | undefined;

  async start(): Promise<StartedPostgreSqlContainer> {
    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('carecareer_test')
      .withUsername('carecareer_test')
      .withPassword('test_password')
      .start();

    await this.initializeSchema();
    return this.container;
  }

  async stop(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      this.container = undefined;
    }
  }

  getConnectionUri(): string {
    if (!this.container) throw new Error('Container not started');
    return this.container.getConnectionUri();
  }

  /**
   * Get a raw pg Client for direct SQL operations in tests.
   */
  async getClient(): Promise<Client> {
    if (!this.container) throw new Error('Container not started');
    const client = new Client({ connectionString: this.container.getConnectionUri() });
    await client.connect();
    return client;
  }

  private async initializeSchema(): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(`
        -- Application role (cannot bypass RLS)
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_service') THEN
            CREATE ROLE app_service NOINHERIT LOGIN PASSWORD 'app_password';
          END IF;
        END
        $$;

        -- Test tenant table with RLS
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(200) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Test entity table with tenant isolation
        CREATE TABLE IF NOT EXISTS test_entities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id),
          name VARCHAR(200) NOT NULL,
          data JSONB,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Enable and force RLS
        ALTER TABLE test_entities ENABLE ROW LEVEL SECURITY;
        ALTER TABLE test_entities FORCE ROW LEVEL SECURITY;

        -- RLS policy: tenant isolation
        DROP POLICY IF EXISTS tenant_isolation ON test_entities;
        CREATE POLICY tenant_isolation ON test_entities
          USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

        -- Event outbox table
        CREATE TABLE IF NOT EXISTS event_outbox (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          event_type VARCHAR(200) NOT NULL,
          event_version INTEGER NOT NULL DEFAULT 1,
          aggregate_type VARCHAR(100) NOT NULL,
          aggregate_id UUID NOT NULL,
          aggregate_version INTEGER NOT NULL DEFAULT 1,
          payload JSONB NOT NULL,
          correlation_id VARCHAR(200) NOT NULL,
          causation_id VARCHAR(200),
          occurred_at VARCHAR(50) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          published_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
        ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON event_outbox;
        CREATE POLICY tenant_isolation ON event_outbox
          USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

        -- Idempotency table
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          operation VARCHAR(500) NOT NULL,
          idempotency_key VARCHAR(128) NOT NULL,
          request_hash VARCHAR(64) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
          response_status INTEGER,
          response_body JSONB,
          resource_type VARCHAR(100),
          resource_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL,
          locked_until TIMESTAMPTZ,
          CONSTRAINT uq_idempotency_key UNIQUE (tenant_id, operation, idempotency_key)
        );

        -- Grant permissions to app role
        GRANT SELECT, INSERT, UPDATE, DELETE ON test_entities TO app_service;
        GRANT SELECT, INSERT, UPDATE, DELETE ON event_outbox TO app_service;
        GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO app_service;
        GRANT SELECT, INSERT ON tenants TO app_service;
      `);
    } finally {
      await client.end();
    }
  }
}
