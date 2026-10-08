# Build environment
FROM node:22-alpine AS builder

# Enable corepack for modern package management if needed
# RUN corepack enable

WORKDIR /app
COPY package*.json ./
# Cài đặt toàn bộ dependencies (bao gồm devDependencies) để build
RUN npm ci

COPY . .
# Build Next.js và NestJS
RUN npm run build:web
RUN npm run build:api

# Production runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy package.json và cài đặt chỉ production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build artifacts từ builder
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/dist/apps/api ./dist/apps/api
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Sinh Prisma client
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# Đặt quyền sở hữu cho node user
RUN chown -R node:node /app
USER node

# Expose ports
EXPOSE 3000 4000

# Chạy cả Next.js và NestJS bằng concurrently hoặc command tuỳ chỉnh
CMD ["sh", "-c", "node dist/apps/api/main.js & npx next start apps/web"]
