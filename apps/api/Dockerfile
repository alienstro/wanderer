# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:24-slim AS base
# Prisma needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wanderer/api build
# Copy the API, its production dependencies, and the built shared package to /out.
RUN pnpm deploy --filter @wanderer/api --prod --legacy /out

FROM base AS run
ENV NODE_ENV=production
ENV PORT=3001
# The avatar images. Mount a volume here, so that they stay after a new deploy.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown node:node /data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
# Apply the migrations, then start the API.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
