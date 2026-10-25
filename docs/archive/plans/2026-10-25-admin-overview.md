# Admin Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin opens `/admin/overview` and sees the health, the use and the failures of the app (issue #49).

**Architecture:** A new `AppEvent` table records the failures and the logins that no table records today. Admin endpoints count from the existing tables and from `AppEvent`, grouped by day in the time zone of the admin. A web page shows summary cards, SVG trend lines, a problem list and a top-character list.

**Tech Stack:** NestJS 12, Prisma 7 (PostgreSQL, raw SQL for the day groups), Next 16, TanStack Query, Tailwind 4. No new dependency.

**Spec:** GitHub issue #49. The user told me to use my recommendations for the open questions.

## Global Constraints

- All admins see the same page. The page shows no chat text, no API key and no proxy URL.
- `AppEvent.reason` holds only a short code, such as an `AiErrorCode`. Never prompt text, message text, keys or URLs.
- `AppEvent` rows older than 90 days are deleted.
- Each new endpoint is behind `SessionGuard` and `AdminGuard`: a normal user gets `403 {error:"forbidden"}`, a visitor gets `401`.
- A failure to write an `AppEvent` row never fails the user request.
- Periods: `today`, `7d`, `30d`. A day starts at midnight in the `tz` query value (an IANA name, default `UTC`).
- Plain words on the page, such as "Failed AI replies". Each panel has a short help text.
- The page works at 375 px. The page loads in less than 2 seconds with 30 days of data.

## Review Focus

- An unknown `tz` or `period` value: the API gives `400 {error:"invalid_period"}`, not `500`.
- A deleted user or character: the problem row keeps its time and reason and shows "Deleted account" or no character link.
- A database error while the API writes an event: the reply, the choices or the proxy test still gives its normal result.
- A day with no rows: the series has a `0` for that day, so the chart has no gap.
- A Stop of the user or a time limit: a Stop is not a failure; a time limit is a failure with the reason `timeout`.

---

### Task 1: AppEvent table and EventsService

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new enum `AppEventType`, model `AppEvent`, back relations on `User` and `Character`, index on `Message.createdAt`)
- Create: `apps/api/prisma/migrations/20261025120000_app_events/migration.sql`
- Create: `apps/api/src/events/events.service.ts`, `apps/api/src/events/events.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/events.int.test.ts`

**Interfaces:**
- Produces: `AppEventType = login | ai_reply_failed | choices_failed | summary_failed | proxy_test_failed | model_list_failed`.
- Produces: `EventsService.record(type: AppEventType, fields: { userId?: string; characterId?: string; reason?: string }): Promise<void>` (never throws).
- Produces: `EventsService.prune(now?: Date): Promise<number>` (deletes rows older than `EVENT_KEEP_DAYS = 90`). A daily timer calls it.
- `EventsModule` is `@Global()` and exports `EventsService`. `userId` and `characterId` use `onDelete: SetNull`.

- [ ] Tests: `records an event with its fields`, `does not throw when the write fails`, `prune deletes only rows older than 90 days`.
- [ ] Check: `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 test/events.int.test.ts`

### Task 2: Record the failures and the logins

**Files:**
- Modify: `apps/api/src/chats/reply.service.ts`, `choices.service.ts`, `memory.service.ts`, `apps/api/src/proxies/proxies.service.ts`, `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/test/app-events.e2e.test.ts`

**Interfaces:**
- Consumes: `EventsService.record` from Task 1.
- Reply: one `ai_reply_failed` per failed stream, with `reason = result.error` (`timeout` included), or `internal_error` from the catch. A Stop records nothing.
- Choices: `choices_failed` with the `AiErrorCode`, or `bad_choices` after the last bad answer.
- Summary: `summary_failed` with the `AiErrorCode`, or `empty_summary`.
- Proxy test: `proxy_test_failed` with the code. Model list: `model_list_failed` with the `ProxyModelsError` code.
- Login: `login` for each `ok` result.

- [ ] Tests: `a failed reply records ai_reply_failed with the user and the character`, `a reply time limit records timeout`, `failed choices record choices_failed`, `a failed summary records summary_failed`, `a failed proxy test records proxy_test_failed`, `a login records login`, `no event holds the key or the URL`.
- [ ] Check: `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 test/app-events.e2e.test.ts`

### Task 3: Shared types and the stats endpoint

**Files:**
- Create: `packages/shared/src/admin.ts` (export from `index.ts`)
- Create: `apps/api/src/admin/overview.service.ts`, `apps/api/src/admin/overview.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Test: `apps/api/test/admin-overview.e2e.test.ts`

**Interfaces:**
- Produces (shared): `overviewQuerySchema` (`period`, `tz`), `OVERVIEW_METRICS` (key, label, help), `OverviewStats = { period; days: string[]; metrics: Record<OverviewMetric, { total: number; series: number[] }> }`.
- Metrics: `newUsers` (users), `activeUsers` (distinct users who sent a message; the total is distinct over the period), `logins`, `newChats`, `newMessages` (user messages), `newCharacters`, `failedReplies`, `failedChoices`, `failedSummaries`, `failedProxyTests`, `failedModelLists`.
- `GET /admin/overview/stats?period&tz` gives `OverviewStats`. `days` has one `YYYY-MM-DD` per day of the period, oldest first.

- [ ] Tests: `gives 403 to a normal user and 401 to a visitor`, `counts the rows of today and gives 0 for an empty day`, `groups by the day of the tz`, `gives 400 invalid_period for a bad tz or period`.
- [ ] Check: `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 test/admin-overview.e2e.test.ts`

### Task 4: Problems, top characters and health endpoints

**Files:**
- Modify: `apps/api/src/admin/overview.service.ts`, `overview.controller.ts`, `packages/shared/src/admin.ts`
- Test: `apps/api/test/admin-overview.e2e.test.ts`

**Interfaces:**
- `GET /admin/overview/problems?period&tz` gives `{ problems: OverviewProblem[] }`, newest first, max 50. `OverviewProblem = { id; type; reason; createdAt; user: {id, handle} | null; character: {id, title} | null }`. No `login` rows.
- `GET /admin/overview/top-characters?period&tz` gives `{ byChats: TopCharacter[]; byLikes: TopCharacter[] }`, max 5 each. `TopCharacter = { id; title; count }`.
- `GET /admin/overview/health` gives `{ status: "ok" | "some_problems" | "down"; replies: number; failedReplies: number }` for the last 60 minutes. `down`: 5 or more reply tries and 50% or more failed. `some_problems`: 10% or more failed. The web shows `down` when the request fails.
- Shared: `APP_EVENT_LABELS` and `problemReasonText(reason)` for plain words.

- [ ] Tests: `lists problems newest first with no login rows`, `a problem of a deleted user has user null`, `orders the top characters by chats and by likes`, `health is ok, some_problems and down at the thresholds`.
- [ ] Check: same as Task 3.

### Task 5: Web overview page

**Files:**
- Create: `apps/web/src/app/(shell)/admin/overview/page.tsx`, `apps/web/src/components/admin-overview.tsx`, `apps/web/src/components/trend-line.tsx`
- Modify: `apps/web/src/app/(shell)/admin/page.tsx` (links between the two admin pages)
- Test: `apps/web/src/components/admin-overview.test.tsx`

**Interfaces:**
- Consumes: the four endpoints and the shared types of Tasks 3 and 4. It sends `tz` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Period buttons (Today, 7 days, 30 days), a Refresh button, the health badge, the metric cards with a trend line, "Recent problems", "Top characters", and a help text under each panel.

- [ ] Tests: `shows "This page is for the admin." on 403`, `shows the totals and the help texts`, `shows the problem reason in plain words and a "Deleted account" user`, `changes the period`, `shows Down when the health request fails`.
- [ ] Check: `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run --maxWorkers=1 src/components/admin-overview.test.tsx`

### Final gate

- [ ] Lint and typecheck one package at a time, then the API and web tests of this plan, then `/code-review` over the branch.
