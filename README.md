# Wanderer

Wanderer is a text roleplay app with AI characters, for adults (18+). A user finds or makes a
character, then chats with it. The AI replies come from the free models of the app or from the own
AI provider key of the user.

- `apps/api`: the API (NestJS, Prisma, Postgres)
- `apps/web`: the web app (Next.js, React, TanStack Query)
- `packages/shared`: the zod schemas, types and error codes that both apps use
- `e2e`: the Playwright tests

## Run it locally

You need Node 24 (`.nvmrc`), pnpm (`corepack enable`), and Docker.

1. Install the packages:

   ```sh
   pnpm install
   ```

2. Start the local Postgres on port 5433:

   ```sh
   docker compose -f docker-compose.dev.yml up -d
   ```

3. Make the env files from the examples:

   ```sh
   cp apps/api/.env.docker.example apps/api/.env
   cp apps/web/.env.local.example apps/web/.env.local
   ```

   In `apps/api/.env`, set these values:

   ```sh
   DATABASE_URL=postgresql://wanderer:wanderer@localhost:5433/wanderer
   WEB_ORIGIN=http://localhost:3100
   GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
   RUNPOD_API_KEY=local-fake-key
   ```

   To sign in, you also need a Google OAuth client (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`).
   [docs/operations/deploy.md](docs/operations/deploy.md#1-google-oauth-client) shows how to make one.

4. Make the tables, and add the sample characters:

   ```sh
   pnpm --filter @wanderer/api exec prisma migrate deploy
   pnpm --filter @wanderer/api seed:dev
   ```

5. Start both apps:

   ```sh
   pnpm dev
   ```

   The web app is on <http://localhost:3100>. The API is on <http://localhost:3001>.

**Note:** `pnpm dev` does not watch `packages/shared`. After a change there, run
`pnpm --filter @wanderer/shared build`, then start `pnpm dev` again.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the API and the web app |
| `pnpm verify` | Runs lint, typecheck and the tests. CI runs it on each PR to `main`. |
| `pnpm lint` | ESLint, with the border rules and the size rule |
| `pnpm typecheck` | TypeScript in each package |
| `pnpm test` | The unit tests and the API tests (the API tests need the local Postgres) |
| `pnpm depcruise` | Checks the imports between the features |
| `pnpm e2e` | Builds both apps, then runs the Playwright tests |
| `pnpm smoke` | Checks a deployed app |
| `pnpm new:feature <name>` | Makes the files of a new feature in each layer |

## Docs

- [AGENTS.md](AGENTS.md): where code goes and the rules, for people and AI agents
- [docs/architecture.md](docs/architecture.md): the map, the rules, the table owners and the events
- [docs/decisions/](docs/decisions/): the architecture decisions (ADRs)
- [docs/operations/deploy.md](docs/operations/deploy.md): the deploy to Dokploy, backups, and the e2e tests
- [docs/product/](docs/product/): the product specs
