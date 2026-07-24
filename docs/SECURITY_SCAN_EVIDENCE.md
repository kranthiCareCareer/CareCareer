# Security Scan Evidence

## Scan Date: 2026-07-24

## SHA: bdf05e632e8c449cfe19e38e394cfc7e8f9e0c51

## Tool: Trivy 0.72.0

## Image: carecareer-staffing-service

### OS Vulnerabilities (Alpine 3.23.4 — Go toolchain)

| CVE            | Severity | Package           | Assessment                                                                |
| -------------- | -------- | ----------------- | ------------------------------------------------------------------------- |
| CVE-2026-32283 | HIGH     | Go stdlib (apk)   | Not exploitable — Go used only by Alpine package manager, not application |
| CVE-2026-33811 | HIGH     | Go net (apk)      | Same — Alpine tooling only                                                |
| CVE-2026-33814 | HIGH     | Go net/http (apk) | Same                                                                      |
| CVE-2026-39820 | HIGH     | Go net/mail (apk) | Same                                                                      |
| CVE-2026-39822 | HIGH     | Go os (apk)       | Same                                                                      |
| CVE-2026-39836 | HIGH     | Go stdlib (apk)   | Same                                                                      |
| CVE-2026-42499 | HIGH     | Go net/mail (apk) | Same                                                                      |
| CVE-2026-42504 | HIGH     | Go mime (apk)     | Same                                                                      |

**Assessment**: All HIGH findings are in Alpine Linux's Go-compiled package management tools (`apk`). Our application is Node.js-based and does not execute Go code. These vulnerabilities are not exploitable in our runtime context.

**Compensating control**: Production images should use `node:20-slim` (Debian) or distroless to eliminate Alpine tooling entirely.

### Secrets Finding

| Type            | Location                       | Assessment                                                                                                                     |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| SSH Private Key | node_modules/ssh2 test fixture | Dev dependency (testcontainers uses ssh2). Not present in production-only installs. Demo Dockerfile includes all deps for tsx. |

**Remediation**: Production Dockerfile should use `--prod` install to exclude dev dependencies. Current demo Dockerfile includes dev deps for tsx compatibility.

### Application Vulnerabilities

No CRITICAL or HIGH vulnerabilities found in application Node.js dependencies.

## SBOM

Generated in CycloneDX 1.7 format via `trivy image --format cyclonedx`.
SBOM covers OS packages and npm dependencies.

## Non-Root Verification

All service containers run as `appuser:appgroup` (UID 1001, GID 1001).
Verified via Dockerfile `USER appuser` directive.

## Production Safety

The staffing-service module rejects demo authentication in non-development mode:

- `DEMO_MODE=true` only accepted when `NODE_ENV !== 'production'`
- Production startup fails closed when demo auth is configured
