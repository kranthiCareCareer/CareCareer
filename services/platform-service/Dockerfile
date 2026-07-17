# Multi-stage Dockerfile for CareCareer NestJS services
# Produces a minimal, non-root production image

# ─── Stage 1: Dependencies ───
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/request-context/package.json packages/request-context/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/events/package.json packages/events/
COPY packages/idempotency/package.json packages/idempotency/
COPY packages/observability/package.json packages/observability/
COPY packages/service-core/package.json packages/service-core/
COPY services/platform-service/package.json services/platform-service/
RUN pnpm install --frozen-lockfile --prod

# ─── Stage 2: Build ───
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY services/platform-service/ services/platform-service/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @carecareer/platform-service build

# ─── Stage 3: Production ───
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY --from=build /app/services/platform-service/dist ./dist
COPY --from=build /app/services/platform-service/package.json ./

# Labels for traceability
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
ARG VERSION=0.1.0
LABEL org.opencontainers.image.source="https://github.com/carecareer/carecareer"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.version="${VERSION}"

# Switch to non-root
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

EXPOSE 3000

CMD ["node", "dist/main.js"]
