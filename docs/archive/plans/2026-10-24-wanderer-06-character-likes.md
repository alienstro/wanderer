# Character Likes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user likes a character with a heart button, all viewers see the like count, and Discover sorts by "Most liked".

**Architecture:** A `character_likes` table holds one row for each (user, character). A Postgres trigger on that table keeps `characters.like_count` correct for each insert and each delete, the cascade deletes too. `PUT` and `DELETE /characters/:id/like` only insert or delete the row, so they are idempotent.

**Tech Stack:** NestJS 12, Prisma 7 with Postgres 17, zod 4, Next.js with TanStack Query, Vitest.

**Spec:** GitHub issue #20 (alienstro/wanderer), with these decisions from the user on 2026-10-24:
- A Postgres trigger keeps `like_count` correct, not app code in each delete path.
- A creator cannot like their own character. `PUT` gives 400 `own_character`. The owner sees the count and no heart button.
- `likedByMe` is on the character detail only. The card gets `likeCount` only.
- The Discover card shows the like count next to the chat count.

## Global Constraints

- Write each comment and each text in ASD-STE100 Simplified Technical English.
- Run one test file at a time with `--maxWorkers=1` and `NODE_OPTIONS=--max-old-space-size=1024`.
- The API tests need the local Postgres on port 5433 (`docker compose -f docker-compose.dev.yml up -d`).
- Error bodies use the existing form `{ error: "<code>" }`.

## Review Focus

- Two fast `PUT` calls: the count goes up by 1 only. Test in Task 2 (`two PUT calls add one like`).
- A delete of the user who liked: the count of the character goes down. Test in Task 1 (`a user delete lowers the count`).
- A `PUT` on a private character of another user: 404, and the count does not leak. Test in Task 2.
- A `DELETE` after the character becomes private: 404, same rule as `GET`. Test in Task 2.
- A Discover page break between two characters with the same like count: no item repeats and no item is lost. Test in Task 3 (`most_liked pages have no gap`).

---

### Task 1: Schema, migration, and trigger

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `User`, `Character`; new model `CharacterLike`)
- Create: `apps/api/prisma/migrations/20261024120000_character_likes/migration.sql`
- Test: `apps/api/test/likes-schema.int.test.ts`

**Interfaces:**
- Produces: Prisma model `CharacterLike { userId, characterId, createdAt }` with `@@id([userId, characterId])`, `@@index([characterId])`, `@@map("character_likes")`, cascade on both relations. `Character.likeCount Int @default(0) @map("like_count")`. A new index `@@index([status, isPublic, isAdult, likeCount, createdAt])`.

- [ ] **Step 1: Write the failing tests** in `likes-schema.int.test.ts`, in the style of `characters-schema.int.test.ts`:
  - `an insert raises the count`: create a like row, then `likeCount` is 1.
  - `a delete lowers the count`: delete the row, then `likeCount` is 0.
  - `the key blocks a second like`: a second `create` for the same pair rejects with `P2002`.
  - `a user delete lowers the count`: user B likes the character of user A, delete user B, then the like row is gone and `likeCount` is 0.
  - `a character delete removes its likes`: delete the character, then `characterLike.count()` is 0.
- [ ] **Step 2: Run the test.** `pnpm --filter @wanderer/api exec vitest run test/likes-schema.int.test.ts --maxWorkers=1`. Expected: FAIL, because `characterLike` does not exist.
- [ ] **Step 3: Change the schema, then make the migration SQL** with `prisma migrate diff --from-schema <old schema from git> --to-schema prisma/schema.prisma --script`. Add the trigger to the end of the migration by hand: one function `character_likes_count()` and one trigger `AFTER INSERT OR DELETE ON character_likes FOR EACH ROW`. The function adds 1 for `INSERT` and subtracts 1 for `DELETE` on `characters.like_count`.
- [ ] **Step 4: Run the test again.** Expected: PASS (5 tests).
- [ ] **Step 5: Commit.** `feat(api): add the character_likes table and the like_count trigger`

### Task 2: Like endpoints and the like fields

**Files:**
- Modify: `packages/shared/src/characters.ts` (types)
- Create: `apps/api/src/characters/character-likes.service.ts`
- Modify: `apps/api/src/characters/characters.controller.ts`, `characters.module.ts`, `characters.service.ts`, `character-mapper.ts`
- Modify: `apps/web/src/components/character-form/character-form.tsx:98` (the preview card gets `likeCount: 0`)
- Test: `apps/api/test/character-likes.e2e.test.ts`

**Interfaces:**
- Consumes: the Prisma model from Task 1.
- Produces, in `@wanderer/shared`:
  - `CharacterCard.likeCount: number`
  - `CharacterDetail.likedByMe: boolean`
  - `type CharacterLikeState = { likeCount: number; likedByMe: boolean }`
- Produces, in the API:
  - `CharacterLikesService.like(id: string, user: User): Promise<CharacterLikeState>`
  - `CharacterLikesService.unlike(id: string, user: User): Promise<CharacterLikeState>`
  - `PUT /characters/:id/like` and `DELETE /characters/:id/like`, `SessionGuard`, status 200, body `CharacterLikeState`.
  - `toCharacterDetail(row, viewer, likedByMe: boolean)`.

- [ ] **Step 1: Write the failing tests** in `character-likes.e2e.test.ts`:
  - `PUT likes the character`: 200, `{ likeCount: 1, likedByMe: true }`. Then `GET /characters/:id` as the same user gives `likedByMe: true`, `likeCount: 1`.
  - `two PUT calls add one like`: two parallel `PUT` calls, then `likeCount` is 1.
  - `DELETE removes the like`: 200, `{ likeCount: 0, likedByMe: false }`. A second `DELETE` gives the same body.
  - `a second user sees the count`: user C reads the character, `likeCount: 1`, `likedByMe: false`.
  - `a visitor sees the count`: `GET` with no cookie gives `likeCount: 1`, `likedByMe: false`. `PUT` with no cookie gives 401.
  - `the owner cannot like`: 400 `{ error: "own_character" }`.
  - `PUT on a private character of another user gives 404`, and `DELETE` gives 404 too.
  - `PUT on an 18+ character without "Show 18+" gives 403 adult_content`.
  - `PUT with a bad ID gives 404`.
- [ ] **Step 2: Run the test.** `pnpm --filter @wanderer/api exec vitest run test/character-likes.e2e.test.ts --maxWorkers=1`. Expected: FAIL with 404 on the route.
- [ ] **Step 3: Add the types** to `packages/shared`, then rebuild it with `pnpm --filter @wanderer/shared build`.
- [ ] **Step 4: Implement the service.** It reads the character, applies `characterAccess` (404 or 403, as `findVisible` does), and gives 400 `own_character` for the creator. `like` uses `createMany({ skipDuplicates: true })`. `unlike` uses `deleteMany`. Both read `likeCount` again after the write. `findVisible` reads the like row of the viewer for `likedByMe`. `create` and `update` pass `false`.
- [ ] **Step 5: Run the test again.** Expected: PASS. Also run `test/characters.e2e.test.ts`, because the detail shape changes.
- [ ] **Step 6: Commit.** `feat(api): let a user like a character`

### Task 3: "Most liked" sort in Discover

**Files:**
- Modify: `packages/shared/src/characters.ts` (`characterSortSchema`, new `type CharacterSort`)
- Modify: `apps/api/src/characters/cursor.ts`, `character-list.service.ts`
- Test: `apps/api/test/discover.e2e.test.ts`

**Interfaces:**
- Produces: `characterSortSchema = z.enum(["most_chats", "most_liked", "newest"])` and `type CharacterSort = z.infer<typeof characterSortSchema>`. `CursorKey` gets `likeCount: number`.

- [ ] **Step 1: Write the failing tests** in `discover.e2e.test.ts`. Add `likeCount` to `SeedOptions`.
  - `most_liked lists the characters by like count`: counts 5, 9, 0 give the order 9, 5, 0.
  - `most_liked pages have no gap`: 30 characters with 3 like counts, then two pages hold each title one time.
- [ ] **Step 2: Run the test.** Expected: FAIL with 400 `invalid_query`.
- [ ] **Step 3: Implement.** Select `c.like_count` in the key query. Choose the count column from the sort: `(c.like_count, c.created_at, c.id)` for `most_liked`. Write both counts into the cursor.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): sort Discover by most likes`

### Task 4: Heart button, card count, and sort button in the web

**Files:**
- Create: `apps/web/src/app/(shell)/characters/[id]/like-button.tsx`
- Modify: `apps/web/src/app/(shell)/characters/[id]/character-view.tsx:49`, `apps/web/src/components/character-card.tsx:29`, `apps/web/src/lib/format.ts`, `apps/web/src/app/(shell)/discover/discover-view.tsx:13,160`
- Test: `apps/web/src/app/(shell)/characters/[id]/like-button.test.tsx`

**Interfaces:**
- Consumes: `CharacterLikeState`, `CharacterSort`, the `PUT` and `DELETE` routes.
- Produces: `LikeButton({ characterId, likeCount, likedByMe, isOwner }: ...)` and `likesLabel(count: number): string` ("1 like", "12 likes", "1.2K likes").

- [ ] **Step 1: Write the failing tests** in `like-button.test.tsx`, in the style of `start-chat.test.tsx`:
  - `a tap fills the heart and adds one`: `aria-pressed` becomes `true`, and the text shows "4 likes" from "3 likes", before the fetch ends.
  - `an error rolls back`: the fetch rejects, then `aria-pressed` is `false` and the text is "3 likes" again.
  - `a visitor gets a link to /login`: no session, the heart is a link with `href="/login"`.
  - `the owner sees only the count`: no button.
- [ ] **Step 2: Run the test.** `pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/characters/[id]/like-button.test.tsx" --maxWorkers=1`. Expected: FAIL, because the module does not exist.
- [ ] **Step 3: Implement `LikeButton`.** Keep the state locally, change it at once, send `PUT` or `DELETE`, and set the state from the response. A tap while a request runs is ignored. Put it in the header row next to the creator. Use `likesLabel` on the card and the page. Add the "Most liked" button between "Most chats" and "Newest". Use `CharacterSort` from `@wanderer/shared` in place of the local `DiscoverSort` union.
- [ ] **Step 4: Run the test again**, then `character-view.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): add the heart button and the Most liked sort`

### Final gate

- [ ] Run `/do-tests full` one time: lint, typecheck, test, and build.
