# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Production stage ──────────────────────────────────────────────────
FROM node:24-alpine AS production

ARG GIT_HASH=""
ENV GIT_HASH=${GIT_HASH}

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# HTTP server mode. Device-code sign-in prints to stderr (docker logs); the token
# cache should be mounted to a volume (see docker-compose.yml) so auth survives restarts.
ENV TRANSPORT=http
# Bind all interfaces — fastmcp otherwise resolves "localhost" to IPv6 ::1, which a
# published port and the IPv4 HEALTHCHECK below can't reach.
ENV HOST=0.0.0.0
ENV PORT=3333
ENV TOKEN_CACHE_PATH=/data/token.json

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "dist/bin.js"]
