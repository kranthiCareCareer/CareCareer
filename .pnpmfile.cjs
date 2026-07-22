/**
 * pnpm hook to override transitive dependency versions.
 * Resolves HIGH-severity CVEs in dev-only transitive dependencies.
 *
 * - tar-fs: CVE-2024-12905, CVE-2025-48387, CVE-2025-59343
 * - undici: CVE-2026-12151, CVE-2026-1526, CVE-2026-2229
 */
function readPackage(pkg) {
  // Override tar-fs in dockerode (transitive of testcontainers)
  if (pkg.dependencies && pkg.dependencies['tar-fs']) {
    const version = pkg.dependencies['tar-fs'];
    if (version === '2.0.1' || version === '^2.0.0' || version === '~2.0.1') {
      pkg.dependencies['tar-fs'] = '>=2.1.4';
    }
  }

  // Override undici in testcontainers
  if (pkg.dependencies && pkg.dependencies['undici']) {
    const version = pkg.dependencies['undici'];
    if (version.startsWith('5.') || version.startsWith('^5.') || version.startsWith('~5.')) {
      pkg.dependencies['undici'] = '>=6.27.0';
    }
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
