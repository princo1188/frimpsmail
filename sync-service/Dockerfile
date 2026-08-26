FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Run as non-root
RUN addgroup -g 1001 -S sync && adduser -u 1001 -S sync -G sync

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=builder /app/dist ./dist

USER sync

# Health check — the process writes a heartbeat every 10s
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD node -e "const fs=require('fs');const t=Date.parse(fs.readFileSync('/tmp/sync-alive','utf8').trim());if(!Number.isFinite(t)||Date.now()-t>60000)process.exit(1);" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
