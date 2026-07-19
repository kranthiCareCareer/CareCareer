import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/*.integration.spec.ts', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.integration.spec.ts',
        'src/main.ts',
        'src/app.module.ts',
        // Infrastructure repositories — tested by integration tests with real PostgreSQL
        'src/infrastructure/postgres-identity-repository.ts',
        'src/infrastructure/postgres-membership-repository.ts',
        'src/infrastructure/postgres-session-repository.ts',
        'src/infrastructure/postgres-refresh-token-repository.ts',
        'src/infrastructure/database-factory.ts',
        'src/infrastructure/session-state-validator.ts',
        // Application commands — tested by integration tests with real transactions
        'src/application/commands/session-commands.ts',
        'src/application/commands/membership-commands.ts',
        'src/application/commands/change-user-status.command.ts',
        'src/application/queries/user-queries.ts',
        // Controllers — tested by HTTP contract tests (Supertest) and integration
        'src/interface/http/membership.controller.ts',
        'src/interface/http/user.controller.ts',
        'src/interface/http/auth.controller.ts',
        // Application ports — type-only interface files
        'src/application/ports/identity-repository.ts',
        'src/application/ports/membership-repository.ts',
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 70,
        branches: 70,
      },
    },
  },
});
