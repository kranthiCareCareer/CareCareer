# Multi-stage Dockerfile for CareCareer staffing-service
# Produces a minimal, non-root production image

# ─── Stage 1: Install all dependencies ───
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY packages/config/package.json packages/config/
COPY packages/request-context/package.json packages/request-context/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/events/package.json packages/events/
COPY packages/idempotency/package.json packages/idempotency/
COPY packages/observability/package.json packages/observability/
COPY packages/service-core/package.json packages/service-core/
COPY packages/shared-types/package.json packages/shared-types/
COPY services/staffing-service/package.json services/staffing-service/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Stage 2: Build all packages + service ───
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs tsconfig.base.json ./
COPY packages/ packages/
COPY services/staffing-service/ services/staffing-service/
RUN pnpm install --frozen-lockfile
RUN pnpm build

# ─── Stage 3: Production (minimal, non-root) ───
FROM node:22-alpine AS production

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy node_modules (production deps resolved by pnpm)
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled workspace packages (dist/ output) with production-ready package.json
COPY --from=build /app/packages/auth/dist ./node_modules/@carecareer/auth/dist
COPY --from=build /app/packages/auth/package.json ./node_modules/@carecareer/auth/
COPY --from=build /app/packages/config/dist ./node_modules/@carecareer/config/dist
COPY --from=build /app/packages/config/package.json ./node_modules/@carecareer/config/
COPY --from=build /app/packages/database/dist ./node_modules/@carecareer/database/dist
COPY --from=build /app/packages/database/package.json ./node_modules/@carecareer/database/
COPY --from=build /app/packages/events/dist ./node_modules/@carecareer/events/dist
COPY --from=build /app/packages/events/package.json ./node_modules/@carecareer/events/
COPY --from=build /app/packages/idempotency/dist ./node_modules/@carecareer/idempotency/dist
COPY --from=build /app/packages/idempotency/package.json ./node_modules/@carecareer/idempotency/
COPY --from=build /app/packages/observability/dist ./node_modules/@carecareer/observability/dist
COPY --from=build /app/packages/observability/package.json ./node_modules/@carecareer/observability/
COPY --from=build /app/packages/request-context/dist ./node_modules/@carecareer/request-context/dist
COPY --from=build /app/packages/request-context/package.json ./node_modules/@carecareer/request-context/
COPY --from=build /app/packages/service-core/dist ./node_modules/@carecareer/service-core/dist
COPY --from=build /app/packages/service-core/package.json ./node_modules/@carecareer/service-core/
COPY --from=build /app/packages/shared-types/dist ./node_modules/@carecareer/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./node_modules/@carecareer/shared-types/

# Fix main fields to point to dist (production uses compiled JS)
RUN find ./node_modules/@carecareer -name "package.json" -exec \
    sed -i 's|"./src/index.ts"|"./dist/index.js"|g' {} \;

# Copy compiled staffing-service
COPY --from=build /app/services/staffing-service/dist ./dist
COPY --from=build /app/services/staffing-service/package.json ./
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
