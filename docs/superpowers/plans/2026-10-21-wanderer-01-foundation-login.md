# Wanderer Plan 1: Foundation and Google Login

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a deployable monorepo in which a user ticks the Terms checkbox, logs in with Google, picks a handle, and gets a session.

**Architecture:** A pnpm monorepo with `apps/web` (Next.js), `apps/api` (NestJS), and `packages/shared` (Zod schemas). The API owns the Google OAuth code flow, keeps sessions in Postgres, and sets a host-only cookie. The web app calls the API from the browser with credentials.

**Tech Stack:** Node.js 24 LTS, pnpm 12, TypeScript 6.0, Next.js 16.4, React 19, NestJS 12, Prisma 7.10 with Postgres 17, Zod 4, Tailwind CSS 4, TanStack Query 5, `openid-client`, Vitest 5, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-21-wanderer-design.md` (sections 4.1, 5, 6, 7, 10, and 11)

## Plan series

The spec has five parts. Each plan gives working, tested software. This file is Plan 1.

| Plan | Scope | Spec sections |
|---|---|---|
| 1 | Monorepo, API and web skeletons, users, sessions, Google login, Terms checkbox, handle, Docker images, deploy runbook | 4.1, 5, 10, 11 |
| 2 | Characters: create and edit, uploads, tags, Tavern PNG import, Discover, search, For you, the 18+ filter, the character page | 4.2 to 4.4, 4.7 |
| 3 | Proxies and chat: key encryption, SSRF guard, Test, streaming, reply choices, Regenerate, edit and delete | 4.5, 4.6, 9 |
| 4 | Safety and account: reports, admin page, ban, account settings, account deletion, the Terms and Privacy text | 4.8, 4.9 |
| 5 | Operations: Playwright end-to-end tests, R2 backups, health checks, the first production launch | 11, 12 |

## Global Constraints

- Node.js 24 LTS: `.nvmrc` has `24`, and the root `package.json` has `"engines": { "node": ">=24 <25" }`.
- `"packageManager": "pnpm@12.14.0"` in the root `package.json`.
- TypeScript `~6.0.3` in all packages. The NestJS CLI 12 needs `~6.0.2`. Do not use TypeScript 7.
- Prisma `7.10.x` and `@prisma/client` `7.10.x`. Do not use the `8.0.0-rc` releases. Prisma 7 needs `prisma.config.ts`, a generator `output` path, and the `@prisma/adapter-pg` driver adapter. Read the Prisma 7 docs before Task 3.
- Postgres 17 for local work (`postgres:17` image). Make the Dokploy Postgres service the same major version.
- Frontend origin: `https://wanderer.alienstro.xyz`. API origin: `https://wanderer-api.alienstro.xyz`.
- Session cookie: `__Host-wanderer_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`. Life: 30 days, renewed on use.
- The OAuth scopes are `openid email profile` only.
- `TERMS_VERSION = "2026-10-21"` lives in `packages/shared`.
- Handle rule: lowercase `a-z`, `0-9`, and `_`, 3 to 20 characters, unique.
- Tests: run 1 test file at a time with `NODE_OPTIONS=--max-old-space-size=1024` and `--maxWorkers=1`. Build and typecheck use `--max-old-space-size=2048`, one at a time.
- Logs never contain keys, cookies, OAuth codes, or tokens.
- Code comments and docs use ASD-STE100 Simplified Technical English.

## Review Focus

1. **The user cancels on the Google screen.** Google returns `?error=access_denied`. The API must redirect to `/login?error=cancelled`, with no crash and no session. Test in Task 6.
2. **A stale or replayed callback.** The `state` does not match, or the state cookie is missing. The API must answer 400 and create no session. Test in Task 6.
3. **A banned user logs in.** The API must create no session and redirect to `/login?error=banned`. Test in Task 6.
4. **A handle that differs only in case, or two users who pick the same handle at once.** "Tian" becomes "tian", and a database unique error (Prisma `P2002`) becomes 409, not 500. Test in Task 7.
5. **A request through the Cloudflare tunnel.** The request arrives as `http` with `X-Forwarded-Proto: https`. The cookie must still be `Secure`, and the Google redirect URI must use `https`. Test in Task 6.

---

### Task 1: Monorepo and shared package

**Goal:** A pnpm workspace with a `packages/shared` package that holds the handle schema and the terms version.

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs` (ESLint flat config with `typescript-eslint`), `.nvmrc`
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/auth.ts`
- Test: `packages/shared/src/auth.test.ts`

**Interfaces:**
- Produces: the package names `@wanderer/shared`, `@wanderer/api`, and `@wanderer/web`. Each package has the scripts `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), and `test` (`vitest run --maxWorkers=1`).
- Produces: `TERMS_VERSION: "2026-10-21"`, `handleSchema: z.ZodString` (it lowercases and trims the input before the check), `suggestHandle(email: string): string`, `MeResponse` type `{ id: string; name: string; email: string; pictureUrl: string | null; handle: string | null; role: "user" | "admin" }`, and `meResponseSchema`.

- [ ] **Step 1:** Write `auth.test.ts` with these tests:
  - `handleSchema accepts "tian_01"`
  - `handleSchema changes " Tian " to "tian"`
  - `handleSchema rejects "ti"` (too short), a 21-character handle, `"ti an"`, and `"tian!"`
  - `suggestHandle("Tian.Lee+x@gmail.com") returns "tian_lee"`
  - `suggestHandle("ab@x.io") returns "ab_user"` (a short result is padded to 3 or more characters)
- [ ] **Step 2:** Run the check command. Expected: FAIL, because the exports do not exist.
- [ ] **Step 3:** Add the root workspace files and `packages/shared`. `suggestHandle` takes the part before `@` and before `+`, changes characters that are not allowed to `_`, cuts the result to 20 characters, and adds `_user` when it is shorter than 3 characters.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(shared): add the handle schema and the terms version`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/shared exec vitest run src/auth.test.ts --maxWorkers=1`

### Task 2: API skeleton with config, health, CORS, and proxy trust

**Goal:** A NestJS app that checks its environment at start, answers `GET /health`, allows CORS only from the web origin, and trusts the proxy headers.

**Files:**
- Create: `apps/api/package.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/config/env.ts`
- Create: `apps/api/src/health/health.controller.ts`, `apps/api/vitest.config.ts` (with `unplugin-swc`, because Vitest needs SWC for decorator metadata)
- Test: `apps/api/test/health.e2e.test.ts`

**Interfaces:**
- Produces: `loadEnv(source: NodeJS.ProcessEnv): Env`. It throws when a value is missing or wrong. `Env` has `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `COOKIE_SECRET` (32 or more characters), `WEB_ORIGIN`, `ADMIN_EMAILS: string[]`, and `PORT` (default 3001).
- Produces: `createApp(env: Env): Promise<INestApplication>`. It sets `trust proxy` to `1`, CORS for `env.WEB_ORIGIN` with credentials, and `nestjs-pino` with redaction of `req.headers.cookie`, `req.headers.authorization`, and `res.headers["set-cookie"]`. Tests and `main.ts` both use it.
- Produces: `@nestjs/throttler` in `AppModule` with no global limit. Routes set their own limit with `@Throttle()`. The tracker key is the client IP that `trust proxy` gives.

- [ ] **Step 1:** Write `health.e2e.test.ts`:
  - `GET /health returns 200 and {"status":"ok"}`
  - `a request with Origin https://wanderer.alienstro.xyz gets access-control-allow-origin with that origin and access-control-allow-credentials true`
  - `a request with Origin https://evil.example gets no access-control-allow-origin header`
  - `loadEnv throws when COOKIE_SECRET is shorter than 32 characters`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. `ADMIN_EMAILS` is a comma-separated list, trimmed and lowercased.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests.
- [ ] **Step 5:** Commit: `feat(api): add the API skeleton with health, CORS, and env checks`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/health.e2e.test.ts --maxWorkers=1`

### Task 3: Database schema for users, sessions, and terms

**Goal:** Prisma 7 with the first three tables, a local Postgres, and a `PrismaService`.

**Files:**
- Create: `docker-compose.dev.yml` (one `postgres:17` service on port 5432, with a named volume)
- Create: `apps/api/prisma.config.ts`, `apps/api/prisma/schema.prisma`, `apps/api/src/prisma/prisma.service.ts`
- Test: `apps/api/test/schema.int.test.ts`

**Interfaces:**
- Produces: the models `User` (`id` uuid, `email` unique, `googleSub` unique, `name`, `pictureUrl?`, `handle?` unique, `role` enum `user|admin` default `user`, `bannedAt?`, `createdAt`), `Session` (`id`, `userId`, `tokenHash` unique, `expiresAt`, `lastSeenAt`, `createdAt`, cascade on user delete), and `TermsAcceptance` (`id`, `userId`, `version`, `acceptedAt`, cascade on user delete).
- Produces: `PrismaService extends PrismaClient`, with `onModuleInit` that connects. It uses `@prisma/adapter-pg` with `DATABASE_URL`.
- Later plans add the other tables of spec section 7. Do not add them here.

- [ ] **Step 1:** Write `schema.int.test.ts` against `DATABASE_URL_TEST`:
  - `two users with the same email fail with P2002`
  - `two users with the same handle fail with P2002`
  - `the delete of a user deletes their sessions and terms acceptances`
- [ ] **Step 2:** Start Postgres: `docker compose -f docker-compose.dev.yml up -d`. Run the check command. Expected: FAIL, because no schema exists.
- [ ] **Step 3:** Write the schema, then run `pnpm --filter @wanderer/api exec prisma migrate dev --name init`.
- [ ] **Step 4:** Add a test setup file that runs `prisma migrate reset --force --skip-seed` on the test database one time before the file.
- [ ] **Step 5:** Run the check command. Expected: PASS, 3 tests.
- [ ] **Step 6:** Commit: `feat(api): add the user, session, and terms tables`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/schema.int.test.ts --maxWorkers=1`

### Task 4: Sessions and the session guard

**Goal:** Make, check, renew, and end sessions. Keep only the hash of the token.

**Files:**
- Create: `apps/api/src/auth/session.service.ts`, `apps/api/src/auth/session.guard.ts`, `apps/api/src/auth/current-user.decorator.ts`
- Test: `apps/api/test/session.int.test.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3).
- Produces: `SessionService.create(userId: string): Promise<{ token: string; expiresAt: Date }>`. The token is 32 random bytes in base64url. Postgres keeps `sha256(token)`.
- Produces: `SessionService.validate(token: string): Promise<User | null>`. It returns `null` for an unknown token, an expired session, or a banned user. When less than 29 days are left, it moves `expiresAt` to 30 days from now.
- Produces: `SessionService.revoke(token: string): Promise<void>` and `SessionService.revokeAllForUser(userId: string): Promise<void>`.
- Produces: `SESSION_COOKIE = "__Host-wanderer_session"`, `sessionCookieOptions(expiresAt: Date)`, a `SessionGuard` that answers 401 and clears the cookie when `validate` returns `null`, and `@CurrentUser()`.

- [ ] **Step 1:** Write `session.int.test.ts`:
  - `create stores a hash, not the raw token`
  - `validate returns the user for a fresh token`
  - `validate returns null for an expired session`
  - `validate returns null when the user has bannedAt set`
  - `validate moves expiresAt forward when less than 29 days are left`
  - `revoke makes validate return null`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the service, the guard, and the decorator.
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests.
- [ ] **Step 5:** Commit: `feat(api): add database sessions and the session guard`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/session.int.test.ts --maxWorkers=1`

### Task 5: Origin check (CSRF protection)

**Goal:** Refuse each request that changes data unless it comes from the web origin with a JSON body.

**Files:**
- Create: `apps/api/src/security/origin.guard.ts`
- Modify: `apps/api/src/app.module.ts` (register the guard for all routes)
- Test: `apps/api/test/origin.e2e.test.ts`

**Interfaces:**
- Consumes: `Env.WEB_ORIGIN` (Task 2).
- Produces: a global `OriginGuard`. `GET`, `HEAD`, and `OPTIONS` always pass. Other methods need `Origin === WEB_ORIGIN`. A request with a body also needs `Content-Type: application/json`. A route can opt out with `@SkipOriginCheck()`. Plan 2 uses this for the multipart avatar upload, which checks the origin itself.

- [ ] **Step 1:** Write `origin.e2e.test.ts` against a test route `POST /__test/echo`:
  - `POST with the web origin and a JSON body passes`
  - `POST without an Origin header returns 403`
  - `POST from https://other.alienstro.xyz returns 403`
  - `POST with the web origin and text/plain returns 403`
  - `GET without an Origin header passes`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the guard and the `@SkipOriginCheck()` decorator.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): refuse changes that do not come from the web origin`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/origin.e2e.test.ts --maxWorkers=1`

### Task 6: Google login, logout, and `GET /me`

**Goal:** The OAuth code flow with PKCE, the record of the terms acceptance, the admin role from `ADMIN_EMAILS`, and the session cookie.

**Files:**
- Create: `apps/api/src/auth/google-oidc.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/test/auth.e2e.test.ts`

**Interfaces:**
- Consumes: `SessionService`, `SESSION_COOKIE`, `sessionCookieOptions` (Task 4), `TERMS_VERSION`, `MeResponse` (Task 1), and `Env` (Task 2).
- Produces: the interface `GoogleOidc { authorizationUrl(input: { state: string; codeVerifier: string; redirectUri: string }): string; exchange(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ sub: string; email: string; emailVerified: boolean; name: string; picture: string | null }> }`. The real class uses `openid-client`. Tests replace it with a fake through the `GOOGLE_OIDC` Nest token.
- Produces: `GET /auth/google?terms=<version>`. When `terms` is not `TERMS_VERSION`, it redirects to `${WEB_ORIGIN}/login?error=terms`. Otherwise it sets a signed cookie `wanderer_oauth` (10 minutes, `HttpOnly`, `Secure`, `SameSite=Lax`) that holds the state, the PKCE verifier, and the terms version, and redirects to Google.
- Produces: `GET /auth/google/callback`. It checks `state` against the cookie and answers 400 on a mismatch or a missing cookie. On `error=access_denied`, it redirects to `/login?error=cancelled`. An email that Google did not verify goes to `/login?error=email`. It upserts the user by `googleSub`, sets `role` to `admin` when the email is in `ADMIN_EMAILS`, and saves a `TermsAcceptance` for the version. A banned user goes to `/login?error=banned` with no session. Otherwise it sets `SESSION_COOKIE` and redirects to `${WEB_ORIGIN}/onboarding` when `handle` is null, else to `${WEB_ORIGIN}/`.
- Produces: `POST /auth/logout`, which revokes the session, clears the cookie, and returns 204. `GET /me` returns `MeResponse` and uses `SessionGuard`.
- The redirect URI is always `Env.GOOGLE_CALLBACK_URL`. Never build it from the request.
- `GET /auth/google` and `GET /auth/google/callback` have `@Throttle({ default: { limit: 10, ttl: 60_000 } })`, which is 10 requests each minute for each IP (spec section 10).

- [ ] **Step 1:** Write `auth.e2e.test.ts` with a fake `GoogleOidc`:
  - `/auth/google with the right terms version redirects to Google and sets wanderer_oauth`
  - `/auth/google with an old terms version redirects to /login?error=terms`
  - `the callback with a matching state sets __Host-wanderer_session with HttpOnly, Secure, SameSite=Lax and no Domain`
  - `the callback saves a TermsAcceptance with version 2026-10-21`
  - `the callback for an ADMIN_EMAILS address gives role admin`
  - `a new user goes to /onboarding, and a user with a handle goes to /`
  - Review Focus 1: `the callback with error=access_denied redirects to /login?error=cancelled`
  - Review Focus 2: `the callback with a wrong state or no wanderer_oauth cookie returns 400 and sets no session`
  - Review Focus 3: `the callback for a banned user redirects to /login?error=banned and sets no session`
  - Review Focus 5: `a request with X-Forwarded-Proto https still gets a Secure cookie, and the Google URL has an https redirect_uri`
  - `GET /me without a cookie returns 401`, and `POST /auth/logout ends the session`
  - `the 11th GET /auth/google in one minute from one X-Forwarded-For IP returns 429, and another IP still gets 302`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add `google-oidc.ts`, `auth.service.ts`, and `auth.controller.ts`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 13 tests.
- [ ] **Step 5:** Commit: `feat(api): add Google login with PKCE and the terms record`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/auth.e2e.test.ts --maxWorkers=1`

### Task 7: Handle step API

**Goal:** A logged-in user without a handle picks one. `GET /me` gives a suggestion.

**Files:**
- Create: `apps/api/src/me/me.controller.ts`, `apps/api/src/me/me.service.ts`
- Modify: `packages/shared/src/auth.ts` (add `suggestedHandle` to `meResponseSchema`)
- Test: `apps/api/test/me.e2e.test.ts`

**Interfaces:**
- Consumes: `handleSchema`, `suggestHandle` (Task 1), and `SessionGuard`, `@CurrentUser()` (Task 4).
- Produces: `GET /me` adds `suggestedHandle: string | null`. It is null when the user has a handle. Add the field to `meResponseSchema` in `packages/shared`.
- Produces: `PATCH /me` with body `{ "handle": string }`. It returns 200 with `MeResponse`, 400 for an invalid handle, and 409 `{ "error": "handle_taken" }` for a taken one.

- [ ] **Step 1:** Write `me.e2e.test.ts`:
  - `PATCH /me with "Tian" saves "tian"`
  - `PATCH /me with "ti an" returns 400`
  - `GET /me for a user with no handle returns suggestedHandle from the email`
  - Review Focus 4: `PATCH /me with "TIAN" when "tian" exists returns 409`
  - Review Focus 4: `two PATCH /me calls at the same time with the same handle give one 200 and one 409, not a 500` (catch Prisma `P2002`)
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the controller and the service.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): let a new user pick a handle`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/me.e2e.test.ts --maxWorkers=1`

### Task 8: Web skeleton, design tokens, and the API client

**Goal:** A Next.js app with the prototype's colors and fonts, an app shell, and one API client for the browser.

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts` (`output: "standalone"`), `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`
- Create: `apps/web/src/lib/api.ts`, `apps/web/src/lib/query-provider.tsx`
- Test: `apps/web/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `MeResponse` (Task 1).
- Produces: `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`. It uses `NEXT_PUBLIC_API_URL`, always sends `credentials: "include"`, sends `Content-Type: application/json` when a body exists, and throws `ApiError { status: number; code: string | null }` for a status that is not 2xx. It returns `undefined` for 204.
- Produces: `useMe()`, a TanStack Query hook with key `["me"]`. It returns `MeResponse | null` and gives `null` on 401.
- Tokens in `globals.css` (Tailwind 4 `@theme`): `--color-bg #0E0E10`, `--color-sidebar #131316`, `--color-surface #18181B`, `--color-surface-2 #1F1F23`, `--color-text #F4F4F5`, `--color-accent #632EFF`, `--color-gold #F5C26B`. Fonts with `next/font/google`: Inter for the UI, and Cinzel for the logo name only.

- [ ] **Step 1:** Write `api.test.ts` with a fake `fetch`:
  - `apiFetch sends credentials include`
  - `apiFetch with a body sends Content-Type application/json`
  - `apiFetch throws ApiError with status 409 and code handle_taken`
  - `apiFetch returns undefined for 204`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. The layout has the sidebar with the logo and the "WANDERER" name. The other sidebar parts come in Plan 2.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests.
- [ ] **Step 5:** Run `NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @wanderer/web build`. Expected: the build completes.
- [ ] **Step 6:** Commit: `feat(web): add the web skeleton, tokens, and API client`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/lib/api.test.ts --maxWorkers=1`

### Task 9: Login page with the Terms checkbox

**Goal:** The login page of spec 4.1, and draft Terms and Privacy pages.

**Files:**
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/login-form.tsx`
- Create: `apps/web/src/app/terms/page.tsx`, `apps/web/src/app/privacy/page.tsx` (draft text with a visible "Draft" label; Plan 4 writes the final text)
- Test: `apps/web/src/app/login/login-form.test.tsx`

**Interfaces:**
- Consumes: `TERMS_VERSION` (Task 1).
- Produces: `<LoginForm error?: "terms" | "cancelled" | "banned" | "email" />`. The "Continue with Google" control is a link to `${NEXT_PUBLIC_API_URL}/auth/google?terms=2026-10-21`. It has `aria-disabled="true"` and no `href` until the user ticks the box.
- Error text: `terms`: "Please accept the current Terms of Service and Privacy Policy." `cancelled`: "Google login was cancelled." `banned`: "This account is banned." `email`: "Your Google email address is not verified."

- [ ] **Step 1:** Write `login-form.test.tsx`:
  - `the Google link has no href before the box is ticked`
  - `after the box is ticked, the href ends with /auth/google?terms=2026-10-21`
  - `the checkbox label links to /terms and /privacy`
  - `error="banned" shows "This account is banned."`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the pages. The login page reads `error` from the search params.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests.
- [ ] **Step 5:** Commit: `feat(web): add the login page with the terms checkbox`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/app/login/login-form.test.tsx --maxWorkers=1`

### Task 10: Handle step page

**Goal:** After the first login, the user picks a handle, and then goes to Home.

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`, `apps/web/src/app/onboarding/handle-form.tsx`
- Test: `apps/web/src/app/onboarding/handle-form.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `useMe()` (Task 8), `handleSchema` (Task 1), and `PATCH /me` (Task 7).
- Produces: `<HandleForm suggested: string; onDone: () => void />`. It fills the field with `suggested` and checks it with `handleSchema` before the request.

- [ ] **Step 1:** Write `handle-form.test.tsx`:
  - `the field starts with the suggested handle`
  - `an invalid handle shows "Use 3 to 20 lowercase letters, numbers, or _." and sends no request`
  - `a 409 handle_taken answer shows "This handle is taken."`
  - `a 200 answer calls onDone`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the page. It sends a user without a session to `/login` and a user who has a handle to `/`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests.
- [ ] **Step 5:** Commit: `feat(web): add the handle step after the first login`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/app/onboarding/handle-form.test.tsx --maxWorkers=1`

### Task 11: Docker images and the deploy runbook

**Goal:** Two production images that Dokploy can build, and a runbook for the first deploy.

**Files:**
- Create: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`
- Create: `apps/api/.env.docker.example` (test values only; `DATABASE_URL` points to `host.docker.internal:5432`), and add `.env*` without `.example` to `.gitignore`
- Create: `docs/deploy.md`

**Interfaces:**
- Consumes: `createApp` (Task 2) and the Prisma migrations (Task 3).
- Produces: the API image starts with `prisma migrate deploy`, then `node dist/main.js`, on port 3001, as a non-root user. The web image runs the Next.js standalone server on port 3000, as a non-root user. Both use `node:24-slim` multi-stage builds with `pnpm deploy --filter`.
- Produces: `docs/deploy.md` with these sections:
  1. the Google OAuth client, with the callback `https://wanderer-api.alienstro.xyz/auth/google/callback`
  2. the Dokploy Postgres 17 service, with no public port
  3. the two Dokploy apps from `alienstro/wanderer`, with build paths and the env vars of spec section 11
  4. the Dokploy domains on `http`
  5. the Cloudflare Zero Trust tunnel with the two public hostnames to Traefik
  6. no Cloudflare Access on the app hostnames
  7. R2 backups, with a token that can write only to the one bucket

- [ ] **Step 1:** Write the Dockerfiles and `.dockerignore`.
- [ ] **Step 2:** Run `docker build -f apps/api/Dockerfile -t wanderer-api .`. Expected: the build completes.
- [ ] **Step 3:** Run `docker build -f apps/web/Dockerfile -t wanderer-web .`. Expected: the build completes.
- [ ] **Step 4:** Run the API image against the local Postgres. Run `curl -s localhost:3001/health`. Expected: `{"status":"ok"}`.
- [ ] **Step 5:** Write `docs/deploy.md`.
- [ ] **Step 6:** Commit: `build: add Docker images and the deploy runbook`.

**Check:** `cp apps/api/.env.docker.example apps/api/.env.docker && docker run --rm -d --name wanderer-api-check -p 3001:3001 --env-file apps/api/.env.docker wanderer-api && sleep 5 && curl -fs localhost:3001/health; docker stop wanderer-api-check`

---

## Done for Plan 1

- Each task check passes.
- One full gate at the end, one command at a time: `pnpm -r --workspace-concurrency=1 typecheck`, then `pnpm -r --workspace-concurrency=1 lint`, then each test file with its check command, then both Docker builds.
- One review of the whole branch, such as `/code-review`. Tasks 4, 5, and 6 touch auth, so they also get a review each on the strongest model.
- The owner does the first deploy with `docs/deploy.md`, because it needs the Google and Cloudflare secrets.
