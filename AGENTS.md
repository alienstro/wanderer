# AGENTS.md

Rules for each person and each AI agent that changes this repository.
[docs/architecture.md](docs/architecture.md) has the full map and the reasons.

## Where code goes

A feature has the same folder name in each place:

| Layer | Folder |
|---|---|
| Schemas, types, error codes | `packages/shared/src/<feature>/` (export from `index.ts`) |
| API module, controller, service, unit tests | `apps/api/src/<feature>/` |
| API tests | `apps/api/test/<feature>/` |
| Web screens, hooks, fetch calls | `apps/web/src/features/<feature>/` (export from `index.ts`) |
| Web routes | `apps/web/src/app/` (routes, layouts and metadata only) |
| Small UI parts with no feature logic | `apps/web/src/components/ui/` |
| Browser tests | `e2e/tests/<feature>.spec.ts` |

For a new feature, run `pnpm new:feature <name>`.

## Rules

1. Imports go one way: `app → features → components/ui, lib → @wanderer/shared`.
2. Import another feature only through its `index.ts`, or through the `exports` of its NestJS module.
3. `packages/shared` imports no React, no Next.js and no NestJS.
4. Each table has one owner module. Only the owner writes to it. The owner list is in
   [docs/architecture.md](docs/architecture.md#table-owners).
5. Call another module when you need an answer. Send an event for a side effect.
6. A controller checks the request with the shared zod schema and calls the service. The business
   rules and the Prisma calls go in the service.
7. Keep each source file under 400 lines. Split a feature folder with more than about 10 files.
8. A move changes no logic. Use `git mv`, so that the history stays.

## Commands

| Command | When |
|---|---|
| `pnpm verify` | Before each push. CI runs it on each PR to `main`. |
| `pnpm depcruise` | Before each push. CI runs it too. |
| `pnpm --filter @wanderer/<package> test -- <file>` | One test file while you work |
| `pnpm e2e` | Before a release, or after a change to a whole page |

The API tests need the local Postgres (`docker compose -f docker-compose.dev.yml up -d`).
Two worktrees that run the API tests at the same time must each set their own `DATABASE_URL_TEST`.

## Docs

- Write each doc, comment, commit message and PR text in ASD-STE100 Simplified Technical English:
  short sentences, the active voice, one word for one meaning.
- A PR that changes a rule also changes `docs/architecture.md` or adds an ADR in `docs/decisions/`.
- Write a new product spec in `docs/product/`. Do not add work plans to the repository.

## Commits and PRs

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`, `test:`.
- Open each PR to `dev`. A release PR goes from `dev` to `main`.
- Fill in the PR template.

The Next.js app has its own notes in [apps/web/AGENTS.md](apps/web/AGENTS.md).
