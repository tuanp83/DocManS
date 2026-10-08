# syntax=docker/dockerfile:1
# One image, three roles selected by the compose `command`:
#   migrate -> prisma migrate deploy + production seed (one-shot)
#   api     -> node dist/apps/api/main.js
#   web     -> next start apps/web
# Node 24 matches local development: the API imports workspace packages (@rtms/*) whose entry
# points are TypeScript and relies on Node's built-in type stripping.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/permissions/package.json packages/permissions/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY packages/validation/package.json packages/validation/
RUN npm ci --ignore-scripts

FROM deps AS builder
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_APP_NAME="DocManS"
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_API_BASE_URL" || (echo "NEXT_PUBLIC_API_BASE_URL build arg is required" && exit 1)
COPY . .
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=node:node /app/apps/web/next.config.ts ./apps/web/
COPY --from=builder --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000 4000
CMD ["node", "dist/apps/api/main.js"]
