# Multi-stage Dockerfile for CareCareer staffing-service
# Produces a minimal, non-root production image using pnpm deploy

# ─── Stage 1: Build everything ───
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs tsconfig.base.json turbo.json ./
COPY packages/ packages/
COPY services/staffing-service/ services/staffing-service/
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Use pnpm deploy to create a self-contained deployable directory
# This resolves all workspace dependencies into a flat node_modules
RUN pnpm --filter @carecareer/staffing-service deploy /app/deploy

# Copy compiled workspace package dist/ into the deployed node_modules
# pnpm deploy puts workspace packages in .pnpm/... paths
RUN find /app/deploy/node_modules -path "*/@carecareer/*/package.json" -exec \
      sed -i 's|"./src/index.ts"|"./dist/index.js"|g' {} \; && \
    for pkg in auth config database events idempotency observability request-context service-core shared-types; do \
      target=$(find /app/deploy/node_modules -path "*/@carecareer/$pkg" -type d | head -1); \
      if [ -n "$target" ] && [ -d "/app/packages/$pkg/dist" ]; then \
        cp -r "/app/packages/$pkg/dist" "$target/"; \
      fi; \
    done && echo "Workspace dist copy complete"

# Copy compiled service dist
RUN cp -r /app/services/staffing-service/dist /app/deploy/dist

# ─── Stage 2: Production (minimal, non-root) ───
FROM node:22-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy the deployed application
COPY --from=build /app/deploy/node_modules ./node_modules
COPY --from=build /app/deploy/dist ./dist
COPY --from=build /app/deploy/package.json ./
COPY --from=build /app/services/staffing-service/prisma ./prisma

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
  CMD wget --no-verbose --tries=1 --spider http://localhost:3200/health || exit 1

EXPOSE 3200

CMD ["node", "dist/main.js"]
