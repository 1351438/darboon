# ── Stage 1: Builder ──────────────────────────────────────────────────────────
# Node 22+ is required: @mikro-orm/core v7 uses fs.globSync (Node >= 22.17) and
# modern pnpm relies on node:sqlite (Node 22+).
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/idp/package.json ./apps/idp/package.json
COPY packages/nestjs-verifier/package.json ./packages/nestjs-verifier/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm -r build

# Prune dev dependencies for a slim runtime.
RUN pnpm prune --prod

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN addgroup -S darboon && adduser -S darboon -G darboon

WORKDIR /app

COPY --from=builder --chown=darboon:darboon /app/node_modules ./node_modules
COPY --from=builder --chown=darboon:darboon /app/apps/idp/node_modules ./apps/idp/node_modules
COPY --from=builder --chown=darboon:darboon /app/apps/idp/dist ./apps/idp/dist
COPY --from=builder --chown=darboon:darboon /app/packages/nestjs-verifier/dist ./packages/nestjs-verifier/dist

USER darboon

WORKDIR /app/apps/idp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
