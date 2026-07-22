import { defineConfig } from 'vitest/config';

/**
 * Combined coverage configuration for GP-05 and GP-06 security-critical files.
 * Runs BOTH unit and integration tests together to produce merged coverage.
 * Integration tests use Testcontainers (requires Docker).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 120000,
    include: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: [
        // Authentication/authorization
        'src/infrastructure/staffing-auth.guard.ts',
        'src/infrastructure/staffing-permission.guard.ts',
        'src/infrastructure/local-jwks-token-validator.ts',
        'src/infrastructure/remote-jwks-token-validator.ts',
        'src/infrastructure/identity-state-adapter.ts',
        'src/infrastructure/authorization-adapter.ts',
        'src/infrastructure/service-token-client.ts',
        'src/infrastructure/pii-redaction.ts',
        // Domain logic
        'src/domain/facility.ts',
        'src/domain/department.ts',
        'src/domain/worker.ts',
        'src/domain/credential-requirement.ts',
        // Application commands
        'src/application/commands/create-facility.command.ts',
        'src/application/commands/create-department.command.ts',
        'src/application/commands/create-worker.command.ts',
        'src/application/commands/change-worker-status.command.ts',
        // Repository
        'src/infrastructure/postgres-staffing-repository.ts',
        // Controllers
        'src/interface/http/facility.controller.ts',
        'src/interface/http/worker.controller.ts',
        'src/interface/http/health.controller.ts',
      ],
      exclude: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts'],
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 95,
        lines: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
});
