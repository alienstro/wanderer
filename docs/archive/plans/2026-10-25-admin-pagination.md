# Admin Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Previous / Next pages to the Recent problems list, the two Top characters lists and the Reports page.

**Architecture:** Each list endpoint takes an optional opaque `cursor` and gives `nextCursor` (keyset paging, the same as the comments list). The web keeps a stack of the cursors it visited, so Previous needs no API change. One `usePager` hook and one `Pager` component serve all 4 lists.

**Tech Stack:** NestJS 12, Prisma 7 (raw SQL for the grouped counts), zod, Next 16, TanStack Query 5, Vitest.

**Spec:** The user's answers on 2026-10-25: "Previous / Next pages" with a cursor, on "Recent problems, Top characters, Reports page".

## Global Constraints

- Page size: 20 for problems and reports, 10 for each top characters list.
- A bad cursor gives `400 {error: "invalid_cursor"}`, the same as the comments list.
- The pager shows "Previous", "Page N" and "Next". It is hidden when page 1 has no next page.
- Each list goes back to page 1 when the period changes.
- All text in ASD-STE100. Tests run 1 file at a time with `--maxWorkers=1`.

## Review Focus

1. Rows with the same `createdAt` at a page edge: no row shows two times and no row is skipped (the ID breaks the tie).
2. The admin resolves the last report of page 2: the page goes back to page 1, not to an empty page.
3. Reports about minors at a page edge: page 2 continues the minors, then the other reports, in the same order as one long list.
4. A changed or old cursor: 400 `invalid_cursor`, never 500.
5. The rank and the bar of a top character on page 2: the rank continues from page 1 (11, 12, …), and the bar compares with the first character of the period, not of the page.

---

### Task 1: Problems pages (API)

**Files:**
- Modify: `apps/api/src/characters/cursor.ts` (add `TimeCursorKey`, `encodeTimeCursor`, `decodeTimeCursor`; the comment functions use them)
- Modify: `packages/shared/src/admin.ts` (`ADMIN_PAGE_SIZE = 20`, `overviewPageQuerySchema` = `overviewQuerySchema` + `cursor`, `OverviewProblemList.nextCursor: string | null`)
- Modify: `apps/api/src/admin/overview.service.ts` (`problems` takes the cursor; `parseOverviewPageQuery`)
- Test: `apps/api/test/admin-overview.e2e.test.ts`

**Interfaces:**
- Produces: `parseOverviewPageQuery(query: unknown): OverviewPageQuery` (400 `invalid_period` for a bad period or tz), `OverviewService.problems(query: OverviewPageQuery): Promise<OverviewProblemList>`.

- [ ] **Step 1: Write the failing tests:** `"pages the problems 20 at a time, newest first, with no row two times"` (25 events, 3 with the same `createdAt` at rows 19 to 21; page 1 has 20 rows and a `nextCursor`; page 2 has 5 rows and `nextCursor: null`; the 25 IDs are all different) and `"gives 400 invalid_cursor for a bad cursor"` (`?cursor=abc`).
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=1 test/admin-overview.e2e.test.ts`. Expected: the 2 new tests FAIL.
- [ ] **Step 3: Implement.** Use the same where, order and `take: size + 1` as `CommentsService.list`.
- [ ] **Step 4: Run** the same command. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(api): page the recent problems of the admin overview`.

### Task 2: Top characters pages (API)

**Files:**
- Modify: `packages/shared/src/admin.ts` (`TOP_PAGE_SIZE = 10`, `topCharactersQuerySchema` = page query + `by: "chats" | "likes"`, `TopCharacterPage { characters, nextCursor, maxCount }` replaces `TopCharacterList`)
- Modify: `apps/api/src/admin/overview.service.ts` (`topCharacters(query)`, one raw SQL query: a CTE of the counts, `HAVING` for the cursor `{count, id}`, `ORDER BY count DESC, character_id ASC`, `max(count)` of the CTE as `maxCount`)
- Modify: `apps/api/src/admin/overview.controller.ts`
- Test: `apps/api/test/admin-overview.e2e.test.ts`

**Interfaces:**
- Produces: `GET /admin/overview/top-characters?by=chats|likes&period&tz&cursor` → `TopCharacterPage`. A missing or bad `by` gives 400 `invalid_period`.

- [ ] **Step 1: Write the failing test:** `"pages the top characters 10 at a time, with the count of the first one"` (12 characters with 1 chat each, 1 with 3 chats; page 1 has 10, `maxCount: 3`, a `nextCursor`; page 2 has 3, `maxCount: 3`, `nextCursor: null`, and no ID two times). Change the old top characters test to call `by=chats` and `by=likes`.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): page the top characters of the admin overview`.

### Task 3: Reports pages (API)

**Files:**
- Modify: `packages/shared/src/reports.ts` (`adminReportListQuerySchema { cursor }`, `AdminReportList.nextCursor: string | null`)
- Modify: `apps/api/src/admin/admin.service.ts` (`listOpen(query)`: the cursor is `{minors: boolean, createdAt, id}`; read the minors after the cursor, then fill the page with the other reports; `take: size + 1`)
- Modify: `apps/api/src/admin/admin.controller.ts`
- Test: `apps/api/test/admin-reports.e2e.test.ts`

- [ ] **Step 1: Write the failing tests:** `"pages the open reports 20 at a time, minors first, then the oldest first"` (22 minors reports and 3 other reports; page 1 has 20 minors; page 2 has 2 minors, then the 3 others; the order of the 25 is the same as one list) and `"gives 400 invalid_cursor for a bad cursor"`.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove `LIST_MAX`.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): page the open reports of the admin page`.

### Task 4: Pager and overview pages (web)

**Files:**
- Create: `apps/web/src/components/pager.tsx` (`usePager()` and `Pager`)
- Modify: `apps/web/src/components/admin-overview.tsx`
- Test: `apps/web/src/components/admin-overview.test.tsx`

**Interfaces:**
- Produces: `usePager(): { cursor: string | undefined; page: number; next(cursor: string): void; previous(): void; reset(): void }` and `<Pager label page nextCursor onPrevious onNext />`, a `nav` with `aria-label={label}`.

- [ ] **Step 1: Write the failing tests:** `"Next shows page 2 of the problems, and Previous goes back"` (the second request has `cursor=`, the text "Page 2", Previous gives "Page 1" content again); `"the top characters rank continues on page 2"` (the first row of page 2 has rank 11); `"a new period goes back to page 1"`.
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=1 src/components/admin-overview.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** The query key holds the cursor. Use `placeholderData: keepPreviousData`, so the list does not jump while the next page loads.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): add Previous and Next pages to the admin overview lists`.

### Task 5: Reports pages (web)

**Files:**
- Modify: `apps/web/src/components/admin-reports.tsx`
- Test: `apps/web/src/components/admin-reports.test.tsx`

- [ ] **Step 1: Write the failing tests:** `"Next shows page 2 of the reports"` and `"resolving the last report of page 2 goes back to page 1"`.
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=1 src/components/admin-reports.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** with `usePager` and `Pager` from Task 4.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): add Previous and Next pages to the reports list`.

### Final gate

- [ ] `/do-tests` in changed mode, then update the PR screenshots and the size table.
