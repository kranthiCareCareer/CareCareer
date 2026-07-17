#!/usr/bin/env node
/**
 * demo:down — Stops the CareCareer demo stack.
 * Stops only demo containers without removing unrelated Docker resources.
 */
import { execSync } from 'node:child_process';

console.log('\n▶ Stopping demo services...');

try {
  execSync('docker compose -f docker-compose.demo.yml down', {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  console.log('✓ Demo stack stopped.\n');
} catch (error) {
  console.error('Warning: Could not stop demo stack:', error.message);
  process.exit(1);
}
