# Multi-stage Dockerfile for CareCareer identity-service
# Produces a minimal, non-root production image with compiled JavaScript

# ─── Stage 1: Build (compile TS → JS via esbuild) ───
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc .pnpmfile.cjs ./
COPY packages/ packages/
COPY services/ services/
COPY apps/platform-admin-console/package.json apps/platform-admin-console/
COPY tooling/ tooling/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @carecareer/identity-service run build

# ─── Stage 2: Production runtime ───
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy compiled application
COPY --from=build /app/services/identity-service/dist/main.js ./dist/main.js
COPY --from=build /app/services/identity-service/dist/main.js.map ./dist/main.js.map
COPY --from=build /app/services/identity-service/package.json ./

# Copy migrations
COPY --from=build /app/services/identity-service/prisma/migrations ./prisma/migrations

# No node_modules needed — everything bundled by esbuild

# Labels for traceability
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
ARG VERSION=0.1.0
LABEL org.opencontainers.image.source="https://github.com/kranthiCareCareer/CareCareer"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.version="${VERSION}"

# Switch to non-root
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3100/health || exit 1

EXPOSE 3100

CMD ["node", "dist/main.js"]
