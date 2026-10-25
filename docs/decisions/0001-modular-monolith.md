# 0001: A modular monolith with feature folders

- Date: 2026-10-25
- Status: Accepted
- Issue: #60

## Context

The repository had no written structure. The web app had two styles for the same job: some screens
sat next to their route, and other screens sat in one flat `components/` folder with 42 entries.
No tool checked which module could import which. Four API modules wrote to the `users` table.

## Decision

- Keep one API program (`apps/api`) and one web program (`apps/web`).
- Split each program into feature modules. A feature has the same folder name in each place:
  `packages/shared/src/<feature>/`, `apps/api/src/<feature>/`, `apps/web/src/features/<feature>/`
  and `e2e/tests/<feature>.spec.ts`.
- Each feature shows a small public part to the other features: `index.ts` in the web app and in
  `packages/shared`, and the `exports` of the NestJS module in the API.
- Each table has one owner module. Only the owner writes to it.
- A module calls another module directly when it needs an answer. It sends an event for a side effect.
- Tools check these rules in CI: `eslint-plugin-boundaries`, `dependency-cruiser` and ESLint `max-lines`.

[`../architecture.md`](../architecture.md) has the full rules.

## Other options

- **Microservices:** each feature as its own program with its own database. This adds network calls
  that can fail, data in many databases with no shared transaction, more apps to deploy, and harder
  bug tracing. These costs pay off for many teams that deploy on their own. They do not pay off here.
  The module borders keep this option open.
- **Folders by file type** (`components/`, `hooks/`, `services/`, with all features mixed): one
  feature ends up in many folders. The flat `components/` folder grew this way.
- **All code next to its route:** good for code that one route owns, but code that two routes use has
  no clear home.
- **A repository layer between the services and Prisma:** Prisma is already a typed data layer. A
  repository adds one file for each feature for little gain.

## Result

- A new developer finds a feature in the same folder name in each package.
- CI stops an import that crosses a feature border, and a source file with more than 400 lines.
- A move to a separate service later is possible for one module, because its borders are clear.
