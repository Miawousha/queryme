# Dockerfile
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/kb ./kb
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
# Only the migrate script ships in the runner; eval / validate-kb scripts are
# build-time utilities and don't belong in the production image.
COPY --from=builder /app/scripts/migrate.ts ./scripts/migrate.ts
EXPOSE 3000
CMD ["pnpm", "start"]
