import { Client } from 'pg';

/**
 * Creates test tenants and provides their IDs for integration tests.
 */
export class TestTenantFixture {
  private readonly client: Client;

  constructor(connectionUri: string) {
    this.client = new Client({ connectionString: connectionUri });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  /**
   * Create a test tenant and return its ID.
   */
  async createTenant(name: string): Promise<string> {
    const result = await this.client.query(
      "INSERT INTO tenants (id, name, status) VALUES (gen_random_uuid(), $1, 'ACTIVE') RETURNING id",
      [name],
    );
    return result.rows[0].id as string;
  }

  /**
   * Insert a test entity for a specific tenant.
   * Uses superuser connection (bypasses RLS) to seed data.
   */
  async insertTestEntity(tenantId: string, name: string): Promise<string> {
    const result = await this.client.query(
      'INSERT INTO test_entities (id, tenant_id, name) VALUES (gen_random_uuid(), $1, $2) RETURNING id',
      [tenantId, name],
    );
    return result.rows[0].id as string;
  }

  /**
   * Count entities visible to a specific tenant via RLS.
   */
  async countEntitiesAsTenant(tenantId: string): Promise<number> {
    await this.client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    const result = await this.client.query('SELECT count(*) FROM test_entities');
    await this.client.query('RESET app.tenant_id');
    return parseInt(result.rows[0].count as string, 10);
  }

  /**
   * Clean up all test data.
   */
  async cleanup(): Promise<void> {
    await this.client.query('DELETE FROM event_outbox');
    await this.client.query('DELETE FROM idempotency_keys');
    await this.client.query('DELETE FROM test_entities');
    await this.client.query('DELETE FROM tenants');
  }
}
