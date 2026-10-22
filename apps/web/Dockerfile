# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Next.js puts NEXT_PUBLIC_ values into the browser code at build time, so this is a build argument.
ARG NEXT_PUBLIC_API_URL=https://wanderer-api.alienstro.xyz
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wanderer/web build

FROM node:24-slim AS run
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# The standalone output has the server and only the files that it needs.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# The slim image has no curl, so Node makes the request. /health does not call the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
