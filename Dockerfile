# trueflation.ch — Next.js Container (P0-Skeleton)
# Statischer Export (US 5.4) — dieser Container dient primär der lokalen
# Entwicklung/Verifikation, nicht dem Produktions-Webserver (Hosting-Entscheidung
# in Requirements Abschnitt 11: Auslieferung via CDN, Droplet trägt nur Analytics+Mirror).

FROM node:22-alpine AS base

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runtime (dev-nahe, für lokale Verifikation des Containers)
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
