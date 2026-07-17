import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const TEMPLATE_DIR = join(ROOT, 'services', 'service-template');
const SERVICES_DIR = join(ROOT, 'services');

const RESERVED_NAMES = new Set([
  'service-template',
  'node_modules',
  'dist',
  'src',
  'test',
  'packages',
  'apps',
]);

const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function main(): void {
  const serviceName = process.argv[2];

  if (!serviceName) {
    error('Usage: pnpm generate:service <service-name>');
  }

  // Validate name
  if (!KEBAB_CASE_REGEX.test(serviceName)) {
    error(`Invalid service name "${serviceName}". Must be kebab-case (e.g., platform-service).`);
  }

  if (RESERVED_NAMES.has(serviceName)) {
    error(`"${serviceName}" is a reserved name and cannot be used.`);
  }

  if (serviceName.length < 3 || serviceName.length > 50) {
    error('Service name must be between 3 and 50 characters.');
  }

  const targetDir = join(SERVICES_DIR, serviceName);

  if (existsSync(targetDir)) {
    error(`Directory already exists: services/${serviceName}. Refusing to overwrite.`);
  }

  // Derive names
  const pascalName = toPascalCase(serviceName);
  const packageName = `@carecareer/${serviceName}`;

  log(`Generating service: ${serviceName}`);
  log(`  Package: ${packageName}`);
  log(`  Module:  ${pascalName}Module`);
  log(`  Target:  services/${serviceName}/`);

  try {
    // Copy template
    mkdirSync(targetDir, { recursive: true });
    copyDirectory(TEMPLATE_DIR, targetDir);

    // Replace content in all files
    replaceInAllFiles(targetDir, [
      ['@carecareer/service-template', packageName],
      ['service-template', serviceName],
      ['ServiceTemplate', pascalName],
      ['serviceTemplate', toCamelCase(serviceName)],
    ]);

    // Run formatting (exclude Dockerfile — no Prettier parser)
    log('Running formatter...');
    execSync(`pnpm prettier --write "services/${serviceName}/**" --ignore-unknown`, {
      cwd: ROOT,
      stdio: 'pipe',
    });

    // Install dependencies
    log('Installing dependencies...');
    execSync('pnpm install', { cwd: ROOT, stdio: 'pipe' });

    // Validate lint
    log('Running lint...');
    execSync(`pnpm --filter ${packageName} lint`, { cwd: ROOT, stdio: 'pipe' });

    // Validate typecheck
    log('Running type-check...');
    execSync(`pnpm --filter ${packageName} typecheck`, { cwd: ROOT, stdio: 'pipe' });

    // Validate tests
    log('Running tests...');
    execSync(`pnpm --filter ${packageName} test`, { cwd: ROOT, stdio: 'pipe' });

    // Validate build
    log('Running build...');
    execSync(`pnpm --filter ${packageName} build`, { cwd: ROOT, stdio: 'pipe' });

    log(`\n✓ Service "${serviceName}" generated successfully at services/${serviceName}/`);
    log('  Next steps:');
    log(`  1. Add domain modules to services/${serviceName}/src/`);
    log('  2. Configure database schema in prisma/');
    log('  3. Add service-specific environment variables to .env.example');
  } catch (err: unknown) {
    // Rollback on any failure
    log('\n✗ Generation failed. Rolling back...');
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    if (err instanceof Error) {
      error(`Generation failed: ${err.message}`);
    }
    error('Generation failed: unknown error');
  }
}

function copyDirectory(src: string, dest: string): void {
  const entries = readdirSync(src);

  for (const entry of entries) {
    // Skip node_modules and dist
    if (entry === 'node_modules' || entry === 'dist') continue;

    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDirectory(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

function replaceInAllFiles(dir: string, replacements: [string, string][]): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      replaceInAllFiles(fullPath, replacements);
    } else if (isTextFile(entry)) {
      let content = readFileSync(fullPath, 'utf-8');
      for (const [search, replace] of replacements) {
        content = content.replaceAll(search, replace);
      }
      writeFileSync(fullPath, content, 'utf-8');
    }
  }
}

function isTextFile(filename: string): boolean {
  const textExtensions = ['.ts', '.json', '.yml', '.yaml', '.md', '.mjs', '.js', '.Dockerfile'];
  if (filename === 'Dockerfile') return true;
  return textExtensions.some((ext) => filename.endsWith(ext));
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function log(message: string): void {
  process.stdout.write(message + '\n');
}

function error(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

main();
