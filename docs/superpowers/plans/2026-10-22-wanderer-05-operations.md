# Wanderer Plan 5: Operations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Wanderer ready for the first production launch: health checks that Docker and a monitor can use, Playwright end-to-end tests of the main user flows, a post-deploy smoke check, and a runbook for the R2 backups, a restore, and the launch.

**Architecture:** The API keeps `GET /health` as a liveness check and adds `GET /health/ready`, which also checks Postgres. The web app gets its own `GET /health` route, so the web health check does not depend on the API. Both Dockerfiles get a `HEALTHCHECK`. A new `e2e` workspace runs Playwright against the real built API and the real standalone web server on a separate local database. The tests make users and sessions directly in the database, because Google login cannot run in a test. All other test data goes through the API.

**Tech Stack:** The Plan 4 stack, plus `@playwright/test` 1.64.1 (Chromium only) and `pg` (the 8.x version that the lockfile already has).

**Spec:** `docs/superpowers/specs/2026-10-21-wanderer-design.md` (sections 11 and 12)

**Branch:** `feat/wanderer-05-operations`, made from `origin/dev` after the merge of PR #4. The PR goes to `dev`. Push with `git push -u origin HEAD`.

## Changes to the plan series

| Item | Was | Now | Why |
|---|---|---|---|
| Web health check | The home page (spec 11) | `GET /health` on the web app | The home page calls the API. An API fault must not make Docker restart the web app. A small route is also cheaper than a page render every 30 seconds. |
| API health check | `GET /health` | `GET /health` (liveness) and `GET /health/ready` (Postgres) | Docker restarts a container on a failed liveness check. A restart does not repair Postgres, so the database check goes to a separate readiness route for the monitor. |
| Production seed characters | Left to the builder (spec 13) | The owner makes the first characters in the Create page after the launch | A production seed script can write to the wrong database. The owner also picks images with a correct licence. |
| CI for the tests | Not in the spec | Not in Plan 5 | Each run on this laptop is one process at a time. A CI workflow is a separate decision for the owner. |

## Global Constraints

- All Plan 1 to 4 Global Constraints stay in force (Node 24, pnpm 12, TypeScript ~6.0.3, Prisma 7.10, one test file at a time with `--maxWorkers=1`, ASD-STE100 comments, `NODE_OPTIONS=--max-old-space-size=1024` for tests, `--max-old-space-size=2048` for builds).
- Health responses: success → 200 `{ "status": "ok" }`. A failed readiness check → 503 `{ "status": "unavailable" }`. The body never has an error message or a stack.
- Docker `HEALTHCHECK`: `--interval=30s --timeout=5s --start-period=30s --retries=3`. The `node:24-slim` image has no `curl`, so the check uses `node -e` with `fetch` to `http://127.0.0.1:<port>/health`.
- End-to-end ports and database: web `http://127.0.0.1:3200`, API `http://127.0.0.1:3201`, database `postgresql://wanderer:wanderer@localhost:5433/wanderer_e2e`. The e2e scripts refuse a `DATABASE_URL` whose host is not `localhost`, `127.0.0.1`, or `::1`.
- Playwright: `workers: 1`, `fullyParallel: false`, Chromium only, `retries: 0`, trace `retain-on-failure`. The `e2e` workspace has no other browser.
- E2E users (email, handle, role): `creator@example.com` `e2e_creator` user; `reader@example.com` `e2e_reader` user; `admin@example.com` `e2e_admin` admin. `ADMIN_EMAILS` for the e2e API is `admin@example.com`.
- E2E test data other than users and sessions goes through the API with the `Origin: http://127.0.0.1:3200` header, never through SQL.

## Review Focus

1. A developer runs the e2e tests with `DATABASE_URL` set to the production database: the scripts must stop before any write. (Task 3 test.)
2. Postgres stops while the API runs: `/health` must stay 200, so Docker does not restart the API, and `/health/ready` must give 503 with no error text. (Task 1 test.)
3. The API is down: the web `/health` must stay 200. (Task 2 test.)
4. A second e2e run on the same database: old rows and old uploads must not change the results. (Task 3 test: run the suite two times.)
5. The smoke check against a site where one URL gives 500: the script must exit with code 1 and name the URL. (Task 6 check.)

---

### Task 1: API readiness check and the API Docker health check

**Files:**
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/health/` module file, if the controller needs `PrismaService` there
- Modify: `apps/api/Dockerfile`
- Test: `apps/api/test/health.e2e.test.ts`

**Interfaces:**
- Consumes: `PrismaService` (`$queryRaw`), `createTestApp({ overrides })` from `apps/api/test/support/app.ts`.
- Produces: `GET /health` → 200 `{ status: "ok" }` with no database call. `GET /health/ready` → 200 `{ status: "ok" }` after `SELECT 1`, or 503 `{ status: "unavailable" }`.

- [ ] **Step 1:** Add the failing tests to `apps/api/test/health.e2e.test.ts`:
  - `GET /health/ready returns 200 and {"status":"ok"} when Postgres answers`
  - `GET /health/ready returns 503 and only {"status":"unavailable"} when the database query fails` (override `PrismaService` with an object whose `$queryRaw` rejects with `new Error("connect ECONNREFUSED")`; assert `res.body` equals `{ status: "unavailable" }` exactly)
  - `GET /health returns 200 when the database query fails` (same override)
- [ ] **Step 2:** Run `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/health.e2e.test.ts --maxWorkers=1`. Expected: the 3 new tests fail.
- [ ] **Step 3:** Add `ready()` to `HealthController`. Throw `ServiceUnavailableException({ status: "unavailable" })` when the query fails, and log the error at `warn` level with the Nest `Logger`.
- [ ] **Step 4:** Run the same command. Expected: all tests in the file pass.
- [ ] **Step 5:** Add the `HEALTHCHECK` to `apps/api/Dockerfile` with the Global Constraints values and port 3001.
- [ ] **Step 6:** Commit: `feat(api): add a readiness check and a Docker health check`.

### Task 2: Web health route and the web Docker health check

**Files:**
- Create: `apps/web/src/app/health/route.ts`
- Modify: `apps/web/Dockerfile`
- Test: `apps/web/src/app/health/route.test.ts`

**Interfaces:**
- Produces: `GET /health` on the web app → 200 `{ status: "ok" }`, with `export const dynamic = "force-dynamic"` so that Next.js does not make it a static file. The route does not call the API.

- [ ] **Step 1:** Write the failing test `GET returns 200 and {"status":"ok"} with no fetch`. Stub `globalThis.fetch` with `vi.fn()`, call `GET()`, then assert status 200, body `{ status: "ok" }`, and that `fetch` has no calls.
- [ ] **Step 2:** Run `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/app/health/route.test.ts --maxWorkers=1`. Expected: FAIL, the module is not found.
- [ ] **Step 3:** Write `apps/web/src/app/health/route.ts` with `GET(): Response` (`Response.json`).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Add the `HEALTHCHECK` to `apps/web/Dockerfile` with the Global Constraints values and port 3000.
- [ ] **Step 6:** Commit: `feat(web): add a health route and a Docker health check`.

### Task 3: E2E workspace, test users, and the smoke spec

**Files:**
- Create: `e2e/package.json` (`@wanderer/e2e`, scripts `prepare-db`, `build`, `test`, `typecheck`, `lint`), `e2e/tsconfig.json`, `e2e/playwright.config.ts`
- Create: `e2e/support/local-db.ts`, `e2e/support/prepare-db.ts`, `e2e/support/global-setup.ts`, `e2e/support/users.ts`, `e2e/support/start-web.mjs`
- Create: `e2e/tests/smoke.spec.ts`
- Modify: `pnpm-workspace.yaml` (add `e2e`), root `package.json` (script `e2e`), `.gitignore` (`e2e/.tmp/`, `e2e/test-results/`, `e2e/playwright-report/`)

**Interfaces:**
- Produces: `assertLocalDatabase(url: string): void` in `local-db.ts`. It throws `Error("The e2e tests run only against a local database. DATABASE_URL points to \"<host>\".")` for any other host.
- Produces: `prepare-db.ts` runs `prisma migrate deploy` from `apps/api` on the e2e database, then `TRUNCATE users CASCADE`, then deletes `e2e/.tmp/uploads`. The `tags` table keeps its rows.
- Produces: `E2E_USERS` in `users.ts`: `{ creator, reader, admin }`, each `{ email, handle, name, role, storageState: "e2e/.tmp/<key>.json" }`.
- Produces: `global-setup.ts` inserts each user (`handle` set, so no onboarding) and one session. The session token is `randomBytes(32).toString("base64url")`, and the row keeps only `sha256(token)` as hex in `token_hash`. It writes a storage state with the cookie `__Host-wanderer_session` as a host-only cookie for the API URL (set with `url`, not `domain`), path `/`, `secure: true`, `httpOnly: true`, `sameSite: "Lax"`.
- Produces: `playwright.config.ts` with two `webServer` entries: the API (`node apps/api/dist/main.js`, ready at `http://127.0.0.1:3201/health`) and the web (`node e2e/support/start-web.mjs`, ready at `http://127.0.0.1:3200/health`), both with `reuseExistingServer: false`. `start-web.mjs` copies `.next/static` and `public` into the standalone folder, then runs its `server.js` on port 3200. This runs the same server as the Docker image.
- Produces: root script `e2e` = build the shared package, the API, and the web (with `NEXT_PUBLIC_API_URL=http://127.0.0.1:3201` and `API_INTERNAL_URL=http://127.0.0.1:3201`), one at a time, then `prepare-db`, then `playwright test`.
- Produces: the API env for the e2e server: the e2e database, `WEB_ORIGIN=http://127.0.0.1:3200`, `ADMIN_EMAILS=admin@example.com`, `UPLOAD_DIR=e2e/.tmp/uploads`, `PORT=3201`, a fixed 32-character `COOKIE_SECRET`, the test `KEY_ENCRYPTION_KEY` of Plan 3, and placeholder Google values.

- [ ] **Step 1:** Write `e2e/tests/smoke.spec.ts`:
  - `a visitor sees Discover and a Log in link` (no storage state)
  - `a logged-in user sees their handle in the sidebar` (creator storage state; expect text `@e2e_creator`)
  - `the API and the web health routes answer {"status":"ok"}` (use `request`)
  - `assertLocalDatabase refuses a remote host` (expect a throw for `postgresql://u:p@db.example.com:5432/x`, and no throw for `localhost`)
- [ ] **Step 2:** Add the workspace, the config, and the support files. Install with `pnpm install`, then `pnpm --filter @wanderer/e2e exec playwright install chromium`.
- [ ] **Step 3:** Run `pnpm e2e`. Expected: 4 passed.
- [ ] **Step 4:** Run `pnpm --filter @wanderer/e2e test` a second time without a new build. Expected: 4 passed again (Review Focus 4).
- [ ] **Step 5:** Run `pnpm --filter @wanderer/e2e typecheck` and `pnpm --filter @wanderer/e2e lint`. Expected: no errors.
- [ ] **Step 6:** Commit: `test(e2e): add the Playwright workspace and the smoke tests`.

### Task 4: E2E creator flow

**Files:**
- Create: `e2e/tests/characters.spec.ts`

**Interfaces:**
- Consumes: `E2E_USERS` (Task 3).

- [ ] **Step 1:** Write the tests:
  - `the creator makes a public character and finds it in My characters` (fill the Create form with a title, a bio, one opening, and a tag; publish; expect the title on `/my-characters`)
  - `another user opens the character and starts a chat` (reader; open the character page; pick the first opening; click "Start a new chat"; expect the URL `/chats/<id>` and the opening text on the page)
  - `a user without "Show 18+" sees the 18+ warning, not the definition` (the creator makes an 18+ character through the API; the reader opens it; expect the warning page and no "Definition" heading)
  - `the creator edits the title and the character page shows the new title`
- [ ] **Step 2:** Run `pnpm --filter @wanderer/e2e test tests/characters.spec.ts`. Expected: all pass. A failure from a real bug goes to `superpowers:systematic-debugging`, not to a test change.
- [ ] **Step 3:** Commit: `test(e2e): cover the character and chat start flow`.

### Task 5: E2E safety and account flow

**Files:**
- Create: `e2e/tests/safety.spec.ts`

**Interfaces:**
- Consumes: `E2E_USERS` (Task 3).

- [ ] **Step 1:** Write the tests. Each test makes its own character through the API, so the tests do not depend on order.
  - `a reader reports a character, and the admin sees the report` (reason "Wrongly marked 18+"; expect "Thanks. The admin will look at it."; as admin, expect the title on `/admin`)
  - `the admin hides a reported character, and the reader then sees "Not found"`
  - `a user who is not admin gets no admin page` (reader opens `/admin`; expect no "Reports" heading)
  - `a user deletes their account and lands on the login page` (use a fourth user made in the test, not one of `E2E_USERS`; after the delete, expect `/login`, and expect 401 from `GET /me` with the old cookie)
- [ ] **Step 2:** Run `pnpm --filter @wanderer/e2e test tests/safety.spec.ts`. Expected: all pass.
- [ ] **Step 3:** Commit: `test(e2e): cover reports, the admin page, and account deletion`.

### Task 6: Smoke script and the operations runbook

**Files:**
- Create: `scripts/smoke.mjs`
- Modify: root `package.json` (script `smoke`), `docs/deploy.md`

**Interfaces:**
- Produces: `node scripts/smoke.mjs --web <url> --api <url>`. It checks, one at a time with a 10-second timeout each: API `/health` 200, API `/health/ready` 200, web `/health` 200, web `/login` 200, and web `/` 200. It prints one line for each URL with the status and the time in ms. It exits 0 when all pass, else 1. The defaults are `https://wanderer.alienstro.xyz` and `https://wanderer-api.alienstro.xyz`.

- [ ] **Step 1:** Write `scripts/smoke.mjs` with no dependencies (Node `fetch` and `AbortSignal.timeout`).
- [ ] **Step 2:** Start the two e2e `webServer` commands by hand with the e2e env, then run `node scripts/smoke.mjs --web http://127.0.0.1:3200 --api http://127.0.0.1:3201`. Expected: 5 lines and exit code 0. Stop the API, run it again. Expected: exit code 1 and the API lines show the failure (Review Focus 5). Stop the servers.
- [ ] **Step 3:** Update `docs/deploy.md`:
  - "Health checks": the two routes of each app, the Dockerfile `HEALTHCHECK`, and an external uptime monitor on `https://wanderer-api.alienstro.xyz/health/ready` and `https://wanderer.alienstro.xyz/health`.
  - "Backups to Cloudflare R2": keep the current steps. Add the Dokploy "keep the latest" count of 14 for the database and the volume, an R2 lifecycle rule that deletes objects older than 30 days as a second limit, and a monthly restore drill: restore the newest backup to a new Postgres service in Dokploy, count the rows of `users` and `characters`, then delete that service.
  - "First launch checklist": the order of the launch (secrets → Postgres → API → web → tunnel → backups → `pnpm smoke` → the manual checks → the owner makes the first characters).
  - "End-to-end tests": `docker compose -f docker-compose.dev.yml up -d`, then `pnpm e2e`.
- [ ] **Step 4:** Commit: `docs: add health checks, backups, restore, and the launch checklist to the runbook`.

## After the code: the first production launch

The owner does these steps, because they need the Google, Cloudflare, and Dokploy secrets. The builder helps on request.

1. Follow `docs/deploy.md`, "First launch checklist".
2. Run `pnpm smoke`. Expected: exit code 0.
3. Do the manual checks in `docs/deploy.md`, "Check after the deploy".
4. Do one restore drill before real users come.

## Done for Plan 5

- `pnpm e2e` passes two times in a row on a clean machine with the dev Postgres.
- The full gate passes: `/do-tests full`.
- Both images report `healthy` in `docker inspect --format '{{.State.Health.Status}}'` after a local `docker run`.
