#!/usr/bin/env node
/**
 * Generate a scrypt hash for a service client secret.
 * Output format: scrypt$N$r$p$salt_b64$hash_b64
 *
 * Usage: node scripts/hash-secret.mjs <secret>
 *
 * NEVER commit the plaintext secret.
 * Store only the hash in the database.
 */
import { scryptSync, randomBytes } from 'node:crypto';

const secret = process.argv[2];
if (!secret) {
  console.error('Usage: node scripts/hash-secret.mjs <secret>');
  process.exit(1);
}

if (secret.length < 32) {
  console.error('Secret must be at least 32 characters (use: openssl rand -hex 32)');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(32);
const hash = scryptSync(secret, salt, 64, { N, r, p });
const result = `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
console.log(result);
