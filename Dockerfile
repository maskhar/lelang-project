# syntax=docker/dockerfile:1
# Image produksi project-lelangan-properti. Tiga target dipakai oleh docker-compose.yml:
#   runner  - server Next.js (output "standalone", tanpa devDependencies).
#   worker  - scripts/run-worker.ts (outbox email + proses media) via tsx, butuh devDependencies
#             dan source penuh sehingga memakai stage builder apa adanya.
# sharp butuh binary native per platform; base glibc (bookworm) dipakai, bukan alpine/musl.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Server Next.js runtime — hanya standalone output + static assets, jalan sebagai user non-root.
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system nodejs && useradd --system --gid nodejs --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# Worker outbox — dijalankan dari stage builder (source TypeScript + tsx + node_modules penuh),
# bukan dari standalone output. Perintah sama dengan `npm run worker:outbox` di package.json,
# dipanggil langsung agar tidak butuh HOME/cache npm saat berjalan sebagai user non-root.
FROM builder AS worker
ENV NODE_ENV=production
RUN groupadd --system nodejs && useradd --system --gid nodejs --uid 1001 nextjs
USER nextjs
CMD ["node", "--conditions=react-server", "--import=tsx", "scripts/run-worker.ts"]
