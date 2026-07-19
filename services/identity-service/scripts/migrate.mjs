#!/usr/bin/env node
/**
 * Runs identity-service database migrations in order.
 * Usage: node scripts/migrate.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const migrationsDir = resolve(import.meta.dirname, '..', 'prisma', 'migrations');

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Get migration files sorted
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Running ${files.length} migrations...`);

    for (const file of files) {
      const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
      console.log(`  → ${file}`);
      await client.query(sql);
    }

    console.log('All migrations applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
