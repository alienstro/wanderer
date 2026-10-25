# Architecture

Wanderer is a **modular monolith**: one API program and one web program, each split into feature
modules with strict borders. [ADR 0001](decisions/0001-modular-monolith.md) gives the reasons.

## The map

```
wanderer/
├── README.md                    What the app is, how to run it, links to docs
├── AGENTS.md                    Where code goes, the commands, the rules
├── apps/
│   ├── api/                     NestJS + Prisma
│   │   ├── prisma/              schema.prisma, migrations, seed-dev.ts
│   │   ├── src/<feature>/       NestJS module, controller, service, unit tests
│   │   └── test/<feature>/      API tests of the feature (real Postgres)
│   └── web/src/                 Next.js
│       ├── app/                 Routes only. Each page.tsx shows one feature screen.
│       ├── features/<feature>/  index.ts, components/, hooks/, api.ts
│       ├── components/ui/       Small parts with no feature logic
│       └── lib/                 api.ts, query-provider.tsx, format.ts
├── packages/shared/src/<feature>/  index.ts: zod schemas, types, error codes
├── e2e/tests/<feature>.spec.ts  Playwright tests
├── scripts/                     smoke.mjs, new-feature.mjs
├── docs/
│   ├── architecture.md          This file
│   ├── decisions/               One short file for each decision (ADR)
│   ├── operations/              deploy.md, backups, key rotation
│   ├── product/                 The product specs
│   └── archive/plans/           Old AI work plans. Not current.
└── .github/                     ci.yml, deploy.yml, PR template, issue forms
```

A feature has the **same folder name in each place**. For example, energy is in
`packages/shared/src/energy/`, `apps/api/src/energy/` and `apps/web/src/features/energy/`.

## The features

| Feature | Shared | API | Web | What it does |
|---|---|---|---|---|
| `admin` | `admin/` | `admin/` | `features/admin/` | Admin screens: overview, models, energy, reports, users |
| `api-keys` | `api-keys/` | `api-keys/` | in `features/settings/` | Saved AI provider keys |
| `auth` | `auth/` | `auth/` | `features/auth/` | Google sign-in, sessions, terms, handle |
| `characters` | `characters/` | `characters/`, `tags/` | `features/characters/` | Characters, the character form, likes |
| `chats` | `chats/` | `chats/` | `features/chats/` | Chats, replies, choices, memory |
| `comments` | `comments/` | `comments/` | `features/comments/` | Comments on a character |
| `discover` | in `characters/` | in `characters/` | `features/discover/` | The Discover page |
| `energy` | `energy/` | `energy/` | in `features/admin/` | The energy balance and spends |
| `events` | — | `events/` | — | The app events that the admin overview counts |
| `files` | — | `files/` | — | Uploaded images |
| `free-models` | in `energy/` | `free-models/` | in `features/admin/` | The free models of the app |
| `landing` | — | — | `features/landing/` | The landing page |
| `legal` | — | — | `features/legal/` | Terms and Privacy |
| `me` | in `auth/` | `me/` | in `features/settings/` | The profile and preferences of the user |
| `proxies` | `proxies/` | `proxies/`, `ai/` | `features/settings/` | The own AI models of a user |
| `reports` | `reports/` | `reports/` | `features/reports/` | Reports of a character or a comment |
| `scenes` | in `chats/` | `scenes/` | in `features/chats/` | Scene pictures |
| `shell` | — | — | `features/shell/` | The sidebar, the app frame |

Support modules of the API: `common/`, `config/`, `health/`, `prisma/`, `security/`, `support/`.

## Layer rules

| Layer | It does | It does not |
|---|---|---|
| `app/` (web) | Routes, layouts, metadata | Hold feature logic or large components |
| `features/<name>/` (web) | Screens, hooks and fetch calls of one feature | Import the inside of another feature. Only its `index.ts`. |
| `components/ui/` (web) | Small parts that any feature can use | Know about a feature |
| `lib/` (web) | The fetch client, the query client, format helpers | Know about a feature |
| `*.controller.ts` (API) | Reads the request, checks it with the shared zod schema, calls the service | Hold business rules or Prisma calls |
| `*.service.ts` (API) | Business rules and Prisma calls on the tables that its module owns | Know about HTTP |
| `packages/shared` | Schemas, types, error codes | Import React, Next.js or NestJS |

**Note:** Many older API services check the request body with the zod schema themselves. Move the check to the
controller when you change such a module. `pnpm new:feature` makes a controller that follows the rule.

## Import rules

Imports go one way:

```
app  →  features  →  components/ui, lib  →  @wanderer/shared
```

- A web feature imports another web feature only through its `index.ts`
  (`@/features/chats`, never `@/features/chats/components/composer`).
- A shared feature imports another shared feature only through its `index.ts` (`../energy/index.js`).
  The apps import only from `@wanderer/shared`.
- An API module uses another module only through the providers that the other module `exports`.
- `packages/shared` imports no React, no Next.js and no NestJS.
- No source file has more than 400 lines (blank lines and comments do not count). Test files are exempt.

### The tools that check the rules

| Rule | Tool | Where |
|---|---|---|
| `app → features → ui, lib`, and a web feature imports only the `index.ts` of another feature | `eslint-plugin-boundaries` | `eslint.config.mjs`, in `pnpm lint` |
| A feature imports only the `index.ts` of another feature (web and shared) | `dependency-cruiser` | `apps/web/.dependency-cruiser.cjs`, `packages/shared/.dependency-cruiser.cjs` |
| `packages/shared` has no React, Next.js, NestJS or Prisma | `dependency-cruiser` | `packages/shared/.dependency-cruiser.cjs` |
| A package imports no file of another package (only `@wanderer/shared` by name) | `dependency-cruiser` | `.dependency-cruiser.cjs` (the base that each package extends) |
| Source code imports no test code | `dependency-cruiser` | `.dependency-cruiser.cjs` |
| No circular imports | `dependency-cruiser` | `.dependency-cruiser.cjs` |
| 400 lines for each source file | ESLint `max-lines` | `eslint.config.mjs` |
| Only the owner module writes to a table (API) | ESLint `no-restricted-syntax` | `apps/api/table-owners.mjs` |

`pnpm depcruise` runs dependency-cruiser in each package, one at a time. Each package has its own config,
because dependency-cruiser reads the `paths` of a tsconfig relative to the folder that it runs in.

CI runs `pnpm verify` and `pnpm depcruise` on each pull request to `main`.

## Table owners

Each table has **one owner module**. Only the owner writes to it. Another module that must change the
table calls a method of the owner service. Any module can read a table.

When the write must be in the transaction of the caller, the owner exports a function that takes the
transaction client, for example `banUser(tx, userId)` in `auth/session.service.ts` or
`deleteCommentsOf(tx, authorId)` in `comments/comments.service.ts`. Otherwise the caller calls a method of
the owner service, for example `MeService.setActiveProxy()`.

ESLint checks the rule: `apps/api/table-owners.mjs` holds the owner map, and a Prisma write such as
`tx.user.update()` in a module that does not own the table fails the lint. Keep that map and this table the same.
The check does not see raw SQL (`$executeRaw`).

| Table | Owner | Notes |
|---|---|---|
| `users`: `email`, `google_sub`, `name`, `picture_url`, `role`, `banned_at` | `auth` | The sign-in columns. A ban goes through `auth`. |
| `users`: `handle`, `show_adult`, `adult_confirmed_at`, `reply_choices_*`, `active_proxy_id`, `free_model_id` | `me` | The profile columns. `me` also deletes the account. |
| `users`: `energy`, `energy_refilled_at`, `daily_energy` | `energy` | The spend transactions change the balance. |
| `sessions`, `terms_acceptances` | `auth` | |
| `characters` (all columns but the two counts below), `character_openings`, `character_tags`, `character_likes`, `tags` | `characters` | |
| `characters.chat_count` | `chats` | A count of the chats. It changes in the transaction that saves a chat. |
| `characters.comment_count` | `comments` | A count of the comments. One SQL statement changes the comments and the count, so a race cannot make the count wrong. |
| `character_comments` | `comments` | |
| `chats`, `messages` | `chats` | |
| `files` | `files` | |
| `proxies` | `proxies` | |
| `api_keys` | `api-keys` | |
| `reports` | `reports` | |
| `scene_images` | `scenes` | |
| `energy_entries` | `energy` | |
| `energy_settings`, `free_models`, `scene_models` | `admin` | The admin screens edit these settings. |
| `app_events` | `events` | Other modules send events. See below. |

**Written exceptions:**

- `apps/api/src/admin/overview.service.ts` reads many tables for the admin reports. It only reads.
- A database cascade (`onDelete: Cascade`) deletes the rows of other modules when the owner deletes a
  user or a character. The cascade is in `schema.prisma`, not in a service.

## Events

A module **calls** another module directly when it needs an answer, for example "does the user have
enough energy?". A module **sends an event** for a side effect. The modules that need it listen.
The API uses `@nestjs/event-emitter`. The event names are in `apps/api/src/events/app-events.ts`.

| Event | Sent by | Listened to by | What the listener does |
|---|---|---|---|
| `auth.login` | `auth` | `events` | Saves a `login` app event |
| `chat.reply_failed` | `chats` | `events` | Saves an `ai_reply_failed` app event |
| `chat.choices_failed` | `chats` | `events` | Saves a `choices_failed` app event |
| `chat.summary_failed` | `chats` | `events` | Saves a `summary_failed` app event |
| `proxy.test_failed` | `proxies` | `events` | Saves a `proxy_test_failed` app event |
| `proxy.model_list_failed` | `proxies` | `events` | Saves a `model_list_failed` app event |
| `energy.too_low` | `energy` | `events` | Saves an `energy_too_low` app event |
| `free_model.busy` | `energy` | `events` | Saves a `free_model_busy` app event |
| `admin.changed` | `admin` | `events` | Saves an `admin_change` app event |

The sender uses `await emitter.emitAsync(...)`, so the listener finishes before the response.
A failed listener writes a warning to the log. It never stops the request of the user.

## Where new code goes

| You add | Put it in |
|---|---|
| A new feature | Run `pnpm new:feature <name>`. It makes the files of each layer. |
| A zod schema, a type or an error code that both apps use | `packages/shared/src/<feature>/`, exported from its `index.ts` |
| An API endpoint | The controller of the feature. The rules go in the service. |
| A new table | `schema.prisma`, a migration, and a row in the table owners above |
| A screen | `apps/web/src/features/<feature>/components/`. The route `page.tsx` only renders it. |
| A small part with no feature logic | `apps/web/src/components/ui/` |
| A side effect in another module | An event. Add it to the event list above. |
| A decision that changes a rule | A new ADR in `docs/decisions/`, and an update of this file |

## Growth rules

| Signal | Action |
|---|---|
| A feature folder has more than about 10 files | Split it into sub-folders, such as `chats/reply/`, `chats/choices/`, `chats/memory/` |
| Long jobs (scene images, the daily price refresh) slow the API or need retries | Add `apps/worker` with a job queue, with the same feature modules |
| CI takes more than about 10 minutes | Add Turborepo for build caching |
| A second client, such as a mobile app | Add `packages/api-client` with typed fetch calls |
| One feature needs its own scale or its own deploy | Move only that module into a separate service |
