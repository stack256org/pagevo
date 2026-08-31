# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────────────────────
# Full install (incl. devDependencies) — needed by both the migrator stage
# (drizzle-kit) and the builder stage (typescript, tailwind, etc.).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── migrator ─────────────────────────────────────────────────────────────────
# Standalone target that only applies Drizzle migrations. Used as a one-shot
# `docker compose run`/init-container step before the app or worker start —
# see the `migrate` service in docker-compose.yml.
FROM node:22-bookworm-slim AS migrator
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY lib ./lib
# `pnpm db:migrate` runs `tsx scripts/migrate.ts` — the custom per-file
# migration runner (drizzle's built-in one wraps everything in one
# transaction, which breaks on the ALTER TYPE ... ADD VALUE migrations).
COPY scripts ./scripts
CMD ["pnpm", "db:migrate"]
LABEL org.opencontainers.image.title="Pagevo Migrator" \
      org.opencontainers.image.description="One-shot Drizzle migration runner for Pagevo." \
      org.opencontainers.image.source="https://github.com/sahajtavethiya96/Workflik" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` loads lib/env.ts (Zod-validated) at module-eval time, so it
# needs syntactically valid values to succeed — it does NOT need a reachable
# database. These placeholders are only used during the build step; the real
# values from your .env are read at container *runtime* (see docker-compose.yml).
# Safe because none of this app's NEXT_PUBLIC_* vars are referenced from
# client-side ("use client") code — they're only read in server code, so
# nothing here gets baked into the client bundle.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    APP_SECRET=docker-build-placeholder-override-at-runtime \
    NEXT_PUBLIC_APP_URL=http://localhost:3000

RUN pnpm build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Stamped by CI (see .github/workflows/release.yml) and reported by
# GET /api/health, so an operator can tell which build a container is running.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

RUN groupadd --system --gid 1001 pagevo \
  && useradd --system --uid 1001 --gid pagevo pagevo

# Next.js "standalone" output: a minimal server bundle with only the
# node_modules it actually needs — this is why next.config.mjs sets
# `output: "standalone"`.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Default local-disk storage target (STORAGE_DRIVER=local) — mount a volume
# here in docker-compose.yml so uploads survive container restarts/rebuilds.
RUN mkdir -p /app/uploads && chown -R pagevo:pagevo /app/uploads

USER pagevo
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Baked into the image (not just docker-compose.yml) so `docker run` users
# without Compose still get container health status — checks /api/health,
# which itself verifies DB connectivity (app/api/health/route.ts).
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]

# OCI metadata. This is what renders on the GitHub Packages page, and what
# links the published image back to this repository.
LABEL org.opencontainers.image.title="Pagevo" \
      org.opencontainers.image.description="Self-hosted, open-source Notion-style team workspace." \
      org.opencontainers.image.url="https://github.com/sahajtavethiya96/Workflik" \
      org.opencontainers.image.source="https://github.com/sahajtavethiya96/Workflik" \
      org.opencontainers.image.documentation="https://github.com/sahajtavethiya96/Workflik#readme" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
