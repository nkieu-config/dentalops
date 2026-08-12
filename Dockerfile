# syntax=docker/dockerfile:1

# Debian slim rather than Alpine: Prisma's query engine and argon2's native
# binding both ship glibc prebuilds, so musl would mean compiling them here.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
# Prisma needs libssl present at runtime, not just at generate time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# Build stage: full workspace install (dev deps included) so turbo, the Nest
# CLI and the Prisma CLI are all available.
# ---------------------------------------------------------------------------
FROM base AS build

# Manifests first so the install layer is cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/availability/package.json packages/availability/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@dentalops/api..."

COPY packages/ packages/
COPY apps/api/ apps/api/

# Generated inside the image, so the engine always matches this platform.
RUN pnpm --filter @dentalops/api exec prisma generate
RUN pnpm turbo run build --filter=@dentalops/api

# ---------------------------------------------------------------------------
# Runtime stage: production dependencies only. The Prisma CLI is a runtime
# dependency of apps/api because the entrypoint applies migrations.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001

# All workspace manifests are copied so --frozen-lockfile can still match the
# lockfile's importer list; --filter limits what is actually installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/availability/package.json packages/availability/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@dentalops/api..."

COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter @dentalops/api exec prisma generate

COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/availability/dist packages/availability/dist
COPY --from=build /app/apps/api/dist apps/api/dist

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/v1/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
