/**
 * Production build for staffing-service.
 * Uses esbuild to bundle the service + all workspace packages into dist/main.js.
 * The output is a single executable file that runs with `node dist/main.js`.
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(__dirname, '..');

await build({
  entryPoints: [resolve(serviceRoot, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: resolve(serviceRoot, 'dist/main.js'),
  sourcemap: true,
  minify: false,
  // Only keep truly native/binary packages and NestJS optional modules external
  external: [
    'pg-native',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    'class-transformer',
    'class-validator',
    'cache-manager',
    'ioredis',
  ],
  // Enable decorators
  tsconfig: resolve(serviceRoot, 'tsconfig.build.json'),
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log('Production build complete: dist/main.js');
