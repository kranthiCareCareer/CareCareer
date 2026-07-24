/**
 * Production build for identity-service.
 * Bundles the service + all workspace packages into dist/main.js.
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
  tsconfig: resolve(serviceRoot, 'tsconfig.build.json'),
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log('Production build complete: dist/main.js');
