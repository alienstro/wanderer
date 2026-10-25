# Wanderer Plan 4: Reports, Admin, and Account Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user reports a character, the admin acts on the report (hide, delete, ban, or close), and a user changes their settings or deletes their account.

**Architecture:** A new `reports` module takes reports. A new `admin` module, behind an `AdminGuard`, lists and resolves reports and bans users. `DELETE /me` removes the user through the Prisma cascades, then removes the stored file bytes. The web gets a `/settings` page, a Report dialog on the character page, and an `/admin` page. All request and response shapes are Zod schemas in `packages/shared`.

**Tech Stack:** The Plan 3 stack. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-21-wanderer-design.md` (sections 4.1, 4.7, 4.8, 4.9, 7, 8, and 10)

**Branch:** `feat/wanderer-04-reports-admin`, made from `origin/dev` after the merge of PR #3. The PR goes to `dev`. Push with `git push -u origin HEAD`.

## Changes to the plan series

| Item | Was | Now | Why |
|---|---|---|---|
| Report keeps a `character_title` copy | Not in spec | My call | The admin history must show a title after the character is deleted. |
| `Report.character_id` | Required | Nullable, `onDelete: SetNull` | A deleted character must not delete its reports. |
| Unhide a character | Not in spec | Not in Plan 4 | The spec lists no admin action for it. |
| Terms and Privacy final text | Plan 4 | Plan 4 adds the report and delete sections. The "Draft" label stays. | Legal text is the owner's decision. The owner removes the label after a review. |

## Global Constraints

- All Plan 1, 2, and 3 Global Constraints stay in force (Node 24, pnpm 12, TypeScript ~6.0.3, Prisma 7.10, one test file at a time with `--maxWorkers=1`, ASD-STE100 comments, `NODE_OPTIONS=--max-old-space-size=1024` for tests).
- No new env var. `ADMIN_EMAILS` already sets the `admin` role at each login.
- Report reasons (enum value, then the label): `minors` "Sexual content with minors", `wrong_rating` "Wrongly marked 18+", `hate` "Hate or harassment", `copied` "Copied character", `other` "Other".
- Report note: trimmed, 0–500 characters, default `""`.
- Report actions: `none`, `hidden`, `deleted`, `banned`. Report status: `open`, `closed`.
- `POST /characters/:id/report` checks in this order: body → 400 `invalid_request`; character not `"ok"` for the viewer by `characterAccess` → 404 `not_found`; viewer is the creator → 400 `own_character`; 10 reports or more by this user in the last 24 hours → 429 `report_limit`; a report by this user for this character exists → 409 `already_reported`. Success → 201 `{ id }`.
- Admin routes use `SessionGuard` and then `AdminGuard`. A user without the `admin` role gets 403 `{ "error": "forbidden" }`.
- `GET /admin/reports` gives open reports only, at most 200. The order: `minors` first, then the oldest first.
- `POST /admin/reports/:id/resolve` with `{ action }`. An unknown report → 404 `not_found`. A closed report → 409 `report_closed`. Action `hidden`, `deleted`, or `banned` on a report whose character is gone → 409 `character_gone`.
- A resolve with `hidden`, `deleted`, or `banned` closes all open reports of that character with the same action, `resolved_by`, and `resolved_at`. Action `none` closes only the one report.
- Ban (`POST /admin/users/:id/ban`, and the `banned` action): set `banned_at`, delete all sessions of the user, and set each `published` character of the user to `hidden`. Drafts stay drafts. A ban of an admin → 400 `cannot_ban_admin`. An unknown user → 404 `not_found`. A second ban keeps the first `banned_at` and gives 200.
- The admin sees every character on `GET /characters/:id`, also a hidden, private, or 18+ one.
- `DELETE /me` gives 204 and clears the session cookie. Reports by the user keep `reporter_id = null`. Reports about the user's characters keep `character_id = null`.

## Review Focus

1. A report on a hidden, private, or blocked 18+ character must give 404, so a report does not show that a private character exists. (Task 3 test.)
2. Two admin clicks on the same report: the second resolve must give 409, and it must not run the action again. (Task 4 test.)
3. The admin deletes a character from a report: other users' chats with it go, and the report stays in the database, closed, with the title copy. (Task 4 test.)
4. A banned user with an open browser tab: the next API call must give 401 at once. (Task 5 test.)
5. A user deletes their account while their files are on the volume: the bytes go too, and a storage error must not give 500 after the rows are gone. (Task 6 test.)

---

### Task 1: Shared report schemas

**Files:**
- Create: `packages/shared/src/reports.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/reports.test.ts`

**Interfaces:**
- Produces: `REPORT_REASONS` (tuple), `REPORT_REASON_LABELS: Record<ReportReason, string>`, `ReportReason`, `REPORT_ACTIONS`, `ReportAction`, `createReportRequestSchema` (`{ reason, note }`), `CreateReportRequest`, `resolveReportRequestSchema` (`{ action }`), `adminReportSchema` (`{ id, reason, note, createdAt: string, characterTitle, character: { id, creatorId, creatorHandle: string | null, status } | null, reporterHandle: string | null }`), `AdminReport`, `adminReportListSchema` (`{ reports: AdminReport[] }`).

- [ ] **Step 1: Write the failing tests**
  - `createReportRequestSchema` trims the note, takes 500 characters, refuses 501, and sets `note: ""` when the note is absent.
  - It refuses an unknown reason.
  - `resolveReportRequestSchema` takes each of the 4 actions and refuses `"ban"`.
- [ ] **Step 2: Run** `pnpm --filter @wanderer/shared exec vitest run src/reports.test.ts --maxWorkers=1`. Expected: FAIL, the module does not exist.
- [ ] **Step 3: Write `reports.ts`** with the values from Global Constraints, and export it from `index.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): add the report and admin schemas`.

### Task 2: Report table

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_reports/migration.sql` (from `prisma migrate dev --name reports --create-only`)
- Test: `apps/api/test/reports-schema.int.test.ts`

**Interfaces:**
- Produces: Prisma enums `ReportReason`, `ReportStatus`, `ReportAction`, and model `Report` with `id`, `characterId String?` (`onDelete: SetNull`), `characterTitle`, `reporterId String?` (`onDelete: SetNull`), `reason`, `note`, `status @default(open)`, `action ReportAction?`, `resolvedById String?` (`onDelete: SetNull`), `resolvedAt`, `createdAt`. `@@unique([characterId, reporterId])`, `@@index([status, createdAt])`, `@@index([reporterId, createdAt])`. Snake-case `@map` names, as in the other models.

- [ ] **Step 1: Write the failing tests**
  - A second report by the same user for the same character fails with `P2002`.
  - A delete of the character keeps the report with `characterId === null` and the same `characterTitle`.
  - A delete of the reporter keeps the report with `reporterId === null`.
- [ ] **Step 2: Run** `pnpm --filter api exec vitest run test/reports-schema.int.test.ts --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Add the model and the migration,** then run `pnpm --filter api exec prisma generate`.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): add the report table`.

### Task 3: Admin access and `POST /characters/:id/report`

**Files:**
- Modify: `apps/api/src/characters/visibility.ts` (an admin viewer gets `"ok"`)
- Create: `apps/api/src/auth/admin.guard.ts`
- Create: `apps/api/src/reports/reports.module.ts`, `reports.controller.ts`, `reports.service.ts`; register the module in `app.module.ts`
- Test: `apps/api/test/reports.e2e.test.ts`

**Interfaces:**
- Consumes: Task 1 `createReportRequestSchema`, Task 2 `Report`.
- Produces: `AdminGuard` (reads `req.user`, so it runs after `SessionGuard`). `ReportsService.create(user: User, characterId: string, body: unknown): Promise<{ id: string }>`.

- [ ] **Step 1: Write the failing tests** (`userWithSession` and `createCharacter` from `test/support`)
  - A valid report gives 201 with an `id`, and the row has the character title.
  - A note of 501 characters gives 400 `invalid_request`.
  - A report on a private, a draft, a hidden, and a blocked 18+ character gives 404 `not_found`.
  - A report on the user's own character gives 400 `own_character`.
  - A second report on the same character gives 409 `already_reported`.
  - The 11th report in 24 hours gives 429 `report_limit` (make 10 rows with Prisma first).
  - A visitor gets 401.
  - An admin user gets 200 on `GET /characters/:id` of a hidden character, and a normal user gets 404.
- [ ] **Step 2: Run** `pnpm --filter api exec vitest run test/reports.e2e.test.ts --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement** the guard, the module, and the access change. Map Prisma `P2002` to 409 `already_reported`. Count the 24-hour reports with `createdAt >= now - 86_400_000`.
- [ ] **Step 4: Run** the same test, then `test/characters.e2e.test.ts`, one at a time. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): let users report a character`.

### Task 4: Admin report list and resolve

**Files:**
- Create: `apps/api/src/admin/admin.module.ts`, `admin.controller.ts`, `admin.service.ts`; register the module in `app.module.ts`
- Modify: `apps/api/src/characters/characters.service.ts` (move the delete body to `removeById(id: string): Promise<void>`; `remove` calls it), `characters.module.ts` (export `CharactersService`)
- Test: `apps/api/test/admin-reports.e2e.test.ts`

**Interfaces:**
- Consumes: `AdminGuard`, Task 1 `resolveReportRequestSchema` and `AdminReport`.
- Produces: `AdminService.listOpen(): Promise<AdminReport[]>`, `AdminService.resolve(admin: User, reportId: string, body: unknown): Promise<AdminReport>`, `AdminService.ban(admin: User, userId: string): Promise<void>` (Task 5 fills it).

- [ ] **Step 1: Write the failing tests**
  - A normal user gets 403 `forbidden` on `GET /admin/reports`.
  - The list has only open reports, `minors` first, then the oldest first.
  - `none` closes only that report; a second resolve gives 409 `report_closed`.
  - `hidden` sets the character to `hidden` and closes all its open reports with action `hidden`.
  - `deleted` deletes the character and the chats of another user with it; the report stays closed with action `deleted`, `characterId === null`, and the title copy.
  - `hidden` on a report whose character is gone gives 409 `character_gone`; `none` on it gives 200.
  - An unknown report ID, also a value that is not a UUID, gives 404.
- [ ] **Step 2: Run** `pnpm --filter api exec vitest run test/admin-reports.e2e.test.ts --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement.** Close the reports before the delete, in one `$transaction`, so that the `SetNull` does not lose the character link first. The minors-first order: `ORDER BY (reason = 'minors') DESC, created_at ASC`, or two sorted queries.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): let the admin list and resolve reports`.

### Task 5: Ban a user

**Files:**
- Modify: `apps/api/src/admin/admin.service.ts`, `admin.controller.ts`
- Test: `apps/api/test/admin-ban.e2e.test.ts`

**Interfaces:**
- Consumes: Task 4 `AdminService`.
- Produces: `POST /admin/users/:id/ban` → 200 `{ ok: true }`; the `banned` resolve action calls `ban` on the character's creator.

- [ ] **Step 1: Write the failing tests**
  - After a ban, the banned user's old cookie gets 401 on `GET /me`, and the user has 0 session rows.
  - The banned user's published characters become `hidden`; a draft stays `draft`; Discover no longer lists them.
  - A ban of an admin gives 400 `cannot_ban_admin`; an unknown user gives 404.
  - A second ban gives 200 and keeps the first `bannedAt`.
  - The `banned` resolve action bans the creator and closes all open reports of that character.
- [ ] **Step 2: Run** `pnpm --filter api exec vitest run test/admin-ban.e2e.test.ts --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement** the ban in one `$transaction` (user update, session `deleteMany`, character `updateMany` where `status: "published"`).
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): let the admin ban a user`.

### Task 6: Delete account

**Files:**
- Modify: `apps/api/src/me/me.controller.ts`, `me.service.ts`, `apps/api/src/auth/auth.module.ts` (import `FilesModule`, which exports `FilesService`)
- Modify: `apps/api/src/files/files.service.ts` (add `pathsOf` and `removeBytes`)
- Test: `apps/api/test/delete-account.e2e.test.ts`

**Interfaces:**
- Produces: `FilesService.pathsOf(ownerId: string): Promise<string[]>` gives the stored paths of the owner's files; `FilesService.removeBytes(paths: string[]): Promise<void>` removes each path and logs a storage error, without a throw. `MeService.remove(user: User): Promise<void>`.

- [ ] **Step 1: Write the failing tests** (use `test/support/memory-storage.ts`)
  - `DELETE /me` gives 204 and a `Set-Cookie` that clears the session cookie; the old cookie then gets 401.
  - The user, characters, chats, proxies, sessions, and file rows are gone, and the memory storage has no bytes for the avatar.
  - The user's report stays with `reporterId === null`; a report about the user's character stays with `characterId === null`.
  - A storage error during the byte removal still gives 204.
  - A visitor gets 401.
- [ ] **Step 2: Run** `pnpm --filter api exec vitest run test/delete-account.e2e.test.ts --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement.** Read the paths, delete the user row (the cascades remove the rest), then remove the bytes.
- [ ] **Step 4: Run** the same test, then `test/me.e2e.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): let a user delete their account`.

### Task 7: Settings page

**Files:**
- Create: `apps/web/src/app/(shell)/settings/page.tsx`, `apps/web/src/components/settings-view.tsx`
- Modify: `apps/web/src/components/user-row.tsx` (menu items "Settings", and "Admin" only for `role === "admin"`)
- Test: `apps/web/src/components/settings-view.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `apiFetch`, `PATCH /me`, `POST /me/adult-confirm`, `DELETE /me`.
- Produces: `SettingsView` with the sections Handle, Content (Show 18+), Chat (Reply choices), Models (link to `/settings/models`), and Delete account.

- [ ] **Step 1: Write the failing tests** (stub `fetch`, as in `proxy-form.test.tsx`)
  - A handle save sends `PATCH /me` with `{ handle }`; a 409 shows "This handle is taken."
  - "Show 18+" on, for a user without the confirm, shows the age confirm first; the confirm sends `POST /me/adult-confirm`.
  - "Show 18+" off sends `PATCH /me` with `{ showAdult: false }`.
  - "Reply choices" sends `PATCH /me` with `{ replyChoicesOn }`.
  - Delete account stays disabled until the user types `DELETE`; then it sends `DELETE /me` and goes to `/login`.
- [ ] **Step 2: Run** `pnpm --filter web exec vitest run src/components/settings-view.test.tsx --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse the confirm text of `adult-warning.tsx`. After each change, set the `["me"]` query data from the response.
- [ ] **Step 4: Run** the same test, then `src/components/sidebar.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): add the Settings page`.

### Task 8: Report dialog on the character page

**Files:**
- Create: `apps/web/src/components/report-dialog.tsx`
- Modify: `apps/web/src/app/(shell)/characters/[id]/character-view.tsx` (a "Report" button for a logged-in user who is not the creator)
- Test: `apps/web/src/components/report-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 1 `REPORT_REASONS`, `REPORT_REASON_LABELS`.

- [ ] **Step 1: Write the failing tests**
  - The dialog shows the 5 reasons; Send is disabled until the user picks one.
  - Send posts `{ reason, note }` to `/characters/<id>/report` and shows "Thanks. The admin will look at it."
  - 409 shows "You already reported this character."; 429 shows "You sent too many reports today."
  - The note counter shows `0 / 500` and stops input at 500.
- [ ] **Step 2: Run** `pnpm --filter web exec vitest run src/components/report-dialog.test.tsx --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement** the dialog with `role="dialog"`, a close button, and Escape to close.
- [ ] **Step 4: Run** the same test, then `src/app/(shell)/characters/[id]/character-view.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): add the Report button`.

### Task 9: Admin page

**Files:**
- Create: `apps/web/src/app/(shell)/admin/page.tsx`, `apps/web/src/components/admin-reports.tsx`
- Test: `apps/web/src/components/admin-reports.test.tsx`

**Interfaces:**
- Consumes: Task 1 `AdminReport`; `GET /admin/reports`, `POST /admin/reports/:id/resolve`.

- [ ] **Step 1: Write the failing tests**
  - Each row shows the reason label, the note, the character title (a link when the character exists, "Character deleted" when not), and the reporter handle or "Deleted account".
  - A `minors` row has a "Minors" badge.
  - Close, Hide, Delete, and Ban each send `{ action }`; Delete and Ban first ask "Are you sure?" in the page (no browser `confirm()`).
  - Hide, Delete, and Ban are absent when the character is gone.
  - A 403 shows "This page is for the admin."
  - The row goes from the list after a resolve.
- [ ] **Step 2: Run** `pnpm --filter web exec vitest run src/components/admin-reports.test.tsx --maxWorkers=1`. Expected: FAIL.
- [ ] **Step 3: Implement** with a React Query `["admin-reports"]` query and invalidate it after each resolve.
- [ ] **Step 4: Run** the same test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): add the admin reports page`.

### Task 10: Terms and Privacy text, and the full gate

**Files:**
- Modify: `apps/web/src/app/terms/page.tsx` (a "Reports" part), `apps/web/src/app/privacy/page.tsx` (a "Delete your account" part: what goes, and that reports stay without the reporter)
- Modify: `docs/deploy.md` only if a step changes

- [ ] **Step 1: Add the text.** Do not change `TERMS_VERSION`, because the rules do not change. Keep the "Draft" label.
- [ ] **Step 2: Run the full gate** one step at a time: `pnpm lint`, `pnpm typecheck`, then each test file of api and web one at a time, then `pnpm build` with `NODE_OPTIONS=--max-old-space-size=2048`. Expected: all PASS.
- [ ] **Step 3: Take screenshots** of `/settings`, the Report dialog, and `/admin` (`/do-screenshots`).
- [ ] **Step 4: Commit** `docs(web): add reports and account deletion to Terms and Privacy`.
