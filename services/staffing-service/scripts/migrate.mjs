/**
 * Staffing service migration runner.
 * Executes all SQL migration files in order against the database.
 * Forward-only: no rollback support (by design).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'prisma', 'migrations');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    // Ensure migration tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staffing._migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already applied migrations
    const { rows: applied } = await pool.query(
      'SELECT name FROM staffing._migrations ORDER BY name',
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Read and sort migration files
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = await readFile(join(migrationsDir, file), 'utf-8');
      console.log(`Applying: ${file}`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO staffing._migrations (name) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Migration failed: ${file}`, err.message);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    console.log(`Migrations complete. Applied: ${count}, Total: ${files.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
