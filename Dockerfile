# tor-mcp Next.js app. No browser binary — just a Node.js server that
# proxies HTTP requests through the sidecar tor container via SOCKS5.

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install curl for the healthcheck + openssl (rarely used, but tiny)
RUN apk add --no-cache curl

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["sh", "-c", "npx --yes prisma@6.19.2 migrate deploy 2>/dev/null; npx --yes prisma@6.19.2 db push --accept-data-loss --skip-generate && node server.js"]
