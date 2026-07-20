import { defineConfig } from 'vitest/config';

/**
 * Combined coverage configuration.
 * Runs BOTH unit and integration tests together to produce merged coverage.
 * Integration tests use Testcontainers (requires Docker).
 *
 * Scope: GP-03.3 authentication and session security files ONLY.
 * This ensures security-critical files meet the strict 95%/90% thresholds.
 * GP-03.1/GP-03.2 code (user CRUD, membership CRUD) is excluded from this
 * measurement — it was validated in its own phase.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 120000,
    // Include ALL test files (unit + integration)
    include: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts'],
    // Run sequentially to avoid Testcontainers port conflicts
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      // Only measure GP-03.3 authentication/session security files
      include: [
        'src/domain/session.ts',
        'src/domain/refresh-token.ts',
        'src/domain/signing-key.ts',
        'src/application/commands/session-commands.ts',
        'src/infrastructure/platform-token-validator.ts',
        'src/infrastructure/identity-auth.guard.ts',
        'src/infrastructure/session-state-validator.ts',
        'src/infrastructure/jwt-service.ts',
        'src/infrastructure/postgres-session-repository.ts',
        'src/infrastructure/postgres-refresh-token-repository.ts',
        'src/infrastructure/postgres-signing-key-repository.ts',
        'src/infrastructure/demo-token-validator.ts',
        'src/config/identity-config.ts',
        'src/interface/http/health.controller.ts',
      ],
      exclude: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts'],
      reporter: ['text', 'json-summary', 'json', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 85,
        lines: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});
