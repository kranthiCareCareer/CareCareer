import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/*.integration.spec.ts', 'node_modules/**', 'dist/**'],
  },
});
