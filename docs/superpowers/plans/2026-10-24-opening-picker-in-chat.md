# Opening picker in the chat — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the choice of the opening from the character page into the chat (issue #29).

**Architecture:** A new `Chat.openingIndex` column stores the opening. A new `PATCH /chats/:id/opening` replaces message 0 while the chat has only that message. The chat page draws `<` `>` and `i / N` from `ChatDetail.opening`. The character page shows "Continue latest chat" and "Start a new chat".

**Tech Stack:** NestJS 11, Prisma, Postgres, Zod, Next.js, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-opening-picker-in-chat-design.md`

## Global Constraints

- Tests: `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=1024`, one test file at a time.
- API tests: `DATABASE_URL_TEST=postgresql://wanderer:wanderer@localhost:5433/wanderer_test_opening_picker`. Check `pgrep -lf vitest` first.
- Error codes: `invalid_opening` (400), `opening_locked` (409), `chat_busy` (409).
- Copy: "Start a new chat", "Continue latest chat", "Log in to chat", "Previous opening", "Next opening".
- Comments and copy in ASD-STE100, as the code already does.

## Review Focus

- The creator deletes openings after a chat starts → `opening.index` clamps to `count - 1`; PATCH to a removed index → `400 invalid_opening`. (Task 2 test.)
- A send starts while a PATCH runs, or the reverse → one of them gets `409 chat_busy`. (Task 2 test with the lock held.)
- The user deletes their only message → the chat has only the opening again, and the arrows come back. (Task 3 test.)
- The character is now private or 18+ blocked → PATCH gives `404`, as `loadForReply` does, and the page hides the arrows. (Task 2 and Task 3 tests.)
- A double click on `>` → the arrows are disabled while the request runs. (Task 3 test.)

---

### Task 1: Store the opening index and send it with the chat detail

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Chat`)
- Create: `apps/api/prisma/migrations/20261024140000_chat_opening_index/migration.sql`
- Modify: `packages/shared/src/chats.ts`
- Modify: `apps/api/src/chats/chats.service.ts` (`create`, `get`, `findOwn`)
- Test: `apps/api/test/chats.e2e.test.ts`

**Interfaces:**
- Produces: `Chat.openingIndex: number` (column `opening_index INT NOT NULL DEFAULT 0`).
- Produces: `createChatSchema.openingIndex` optional, `.default(0)`.
- Produces: `openingInputSchema = z.object({ openingIndex: z.number().int().min(0).max(OPENINGS_MAX - 1) })`, `type OpeningInput`.
- Produces: `ChatDetail.opening: { index: number; count: number }`, with `index = Math.min(chat.openingIndex, count - 1)`.
- Produces: a helper `toChatDetail(chat, user)` in `chats.service.ts` that `create`, `get` and Task 2 use, so the detail has one builder.

- [ ] **Step 1: Write the failing tests** in `chats.e2e.test.ts`:
  - `POST /chats without openingIndex starts with opening 0` → `messages[0].content === "The engine coughs again."`, `opening` equals `{ index: 0, count: 2 }`.
  - `POST /chats with openingIndex 1 sends opening { index: 1, count: 2 }`.
  - `GET /chats/:id clamps opening.index when the creator deleted openings` → set `openingIndex: 5` with Prisma, expect `{ index: 1, count: 2 }`.
- [ ] **Step 2: Run, expect FAIL** — `cd apps/api && DATABASE_URL_TEST=... NODE_OPTIONS=--max-old-space-size=1024 pnpm vitest run --maxWorkers=1 test/chats.e2e.test.ts`
- [ ] **Step 3: Add the column and the migration.** The migration backfills old chats:
  ```sql
  ALTER TABLE "chats" ADD COLUMN "opening_index" INTEGER NOT NULL DEFAULT 0;
  UPDATE "chats" c SET "opening_index" = o."position"
  FROM "messages" m, "character_openings" o
  WHERE m."chat_id" = c."id" AND m."position" = 0
    AND o."character_id" = c."character_id" AND o."text" = m."content";
  ```
  Check the real table and column names in the earlier migrations before you write it.
- [ ] **Step 4: Update the shared schema and the service.** `create` saves `openingIndex`. `findOwn` also loads `character._count.openings`.
- [ ] **Step 5: Run `pnpm prisma generate`, then the test file. Expect PASS.**
- [ ] **Step 6: Commit** — `feat(api): store the opening index of a chat`

### Task 2: `PATCH /chats/:id/opening` with a shared chat lock

**Files:**
- Create: `apps/api/src/chats/chat-locks.ts`
- Modify: `apps/api/src/chats/reply.service.ts` (replace the `busy` set)
- Modify: `apps/api/src/chats/chats.service.ts` (new `setOpening`)
- Modify: `apps/api/src/chats/chats.controller.ts`, `apps/api/src/chats/chats.module.ts`
- Test: create `apps/api/test/chat-opening.e2e.test.ts`

**Interfaces:**
- Consumes: `openingInputSchema`, `toChatDetail` (Task 1).
- Produces: `@Injectable() class ChatLocks { run<T>(userId: string, chatId: string, fn: () => Promise<T>): Promise<T> }`. It throws `ConflictException({ error: "chat_busy" })` when the key is held. Export it from the module providers.
- Produces: `ChatsService.setOpening(user: User, id: string, body: unknown): Promise<ChatDetail>`, route `PATCH /chats/:id/opening`.

- [ ] **Step 1: Write the failing tests** in `chat-opening.e2e.test.ts` (copy the setup of `chats.e2e.test.ts`, character with 3 openings):
  - `PATCH opening 2 replaces message 0 and keeps one message` → 200, `messages` has 1 item with opening 3 text, `opening.index === 2`; a new `GET` shows the same.
  - `PATCH after a user message gives 409 opening_locked and changes nothing`.
  - `PATCH with index 7 gives 400 invalid_opening`, and with `{}` gives 400 `invalid_opening`.
  - `PATCH on the chat of another user gives 404`.
  - `PATCH when the character is now private gives 404` (the creator makes it private).
  - `PATCH while the chat lock is held gives 409 chat_busy` → hold the lock with `app.get(ChatLocks).run(userId, chatId, () => pending)`.
- [ ] **Step 2: Run, expect FAIL** (404 on the route).
- [ ] **Step 3: Create `ChatLocks`; make `ReplyService.stream` use `locks.run`.** Keep the existing comments on why the mark comes before the loads.
- [ ] **Step 4: Implement `setOpening`.** Order: parse body (400) → load the chat of the user with the character openings; a missing chat or `characterAccess !== "ok"` gives `404 NOT_FOUND`, as `loadForReply` does, so a hidden opening never leaks → index in range (400) → inside `locks.run`, one `$transaction`: `message.updateMany({ where: { chatId, position: 0, chat: { messages: { none: { position: { gt: 0 } } } } }, data: { content } })`; when `count === 0`, throw `ConflictException({ error: "opening_locked" })`; else `chat.update({ openingIndex })`. Do not change `editedAt` or `lastMessageAt`.
- [ ] **Step 5: Run the new file, then `test/chat-stream.e2e.test.ts` and `test/regenerate.e2e.test.ts`. Expect PASS.**
- [ ] **Step 6: Commit** — `feat(api): change the opening of a chat before the first message`

### Task 3: Arrows and counter in the chat page

**Files:**
- Create: `apps/web/src/app/(shell)/chats/[id]/opening-switcher.tsx`
- Modify: `apps/web/src/app/(shell)/chats/[id]/chat-view.tsx`
- Test: `apps/web/src/app/(shell)/chats/[id]/chat-view.test.tsx`

**Interfaces:**
- Consumes: `ChatDetail.opening`, `PATCH /chats/:id/opening` → `ChatDetail`.
- Produces: `OpeningSwitcher({ index, count, disabled, onPick }: { index: number; count: number; disabled: boolean; onPick: (index: number) => void })`. `<` shows when `index > 0`, `>` when `index < count - 1`. Counter `{index + 1} / {count}` with `aria-live="polite"`.

- [ ] **Step 1: Write the failing tests** in `chat-view.test.tsx` (use the existing mocks of the file):
  - `an opening-only chat with 3 openings shows 1 / 3 and only Next opening`.
  - `Next opening sends PATCH with openingIndex 1 and shows 2 / 3, then Previous opening goes back to 1 / 3`.
  - `the arrows are disabled while the PATCH runs`.
  - `a 409 opening_locked loads the chat again`.
  - `no arrows when the chat has a user message, when count is 1, or when canSend is false`.
- [ ] **Step 2: Run, expect FAIL** — `cd apps/web && NODE_OPTIONS=--max-old-space-size=1024 pnpm vitest run --maxWorkers=1 "src/app/(shell)/chats/[id]/chat-view.test.tsx"`
- [ ] **Step 3: Create `OpeningSwitcher` and render it under message 0 in `chat-view.tsx`.** Show it when `messages.length === 1 && opening.count > 1 && canSend && live === null`. On success, `setQueryData(queryKey, detail)`. A 409 `opening_locked` invalidates `queryKey`; another error shows "The opening did not change. Try again." Follow the JanitorAI layout: `<` left, `>` right, counter centered.
- [ ] **Step 4: Run the test file. Expect PASS.** Then run `reply-choices.test.tsx`.
- [ ] **Step 5: Commit** — `feat(web): pick the opening in the chat`

### Task 4: Character page buttons

**Files:**
- Modify: `apps/web/src/app/(shell)/characters/[id]/start-chat.tsx`
- Modify: `apps/web/src/app/(shell)/characters/[id]/your-chats.tsx` (export the query hook)
- Modify: `apps/web/src/app/(shell)/characters/[id]/character-view.tsx:75` (drop the `openings` prop)
- Test: `apps/web/src/app/(shell)/characters/[id]/start-chat.test.tsx`, `character-view.test.tsx`

**Interfaces:**
- Produces: `useCharacterChats(characterId: string)` in `your-chats.tsx`, with query key `["chats", "character", characterId]`. `YourChats` and `StartChat` both use it.
- Produces: `StartChat({ characterId }: { characterId: string })`.

- [ ] **Step 1: Update the tests:**
  - `start-chat.test.tsx`: `a user with no chat sees only Start a new chat, and a click sends POST /chats with only characterId`; `a user with a chat sees Continue latest chat that links to /chats/<first item id>`; `a visitor sees Log in to chat`.
  - `character-view.test.tsx`: `the page shows no opening text and no "How the story starts" heading`.
- [ ] **Step 2: Run both files, expect FAIL.**
- [ ] **Step 3: Implement.** "Continue latest chat" is a `Link` with `pill pill-accent`; "Start a new chat" then uses `pill pill-soft`. With no chat, "Start a new chat" uses `pill pill-accent`. Keep the error line.
- [ ] **Step 4: Run both files. Expect PASS.**
- [ ] **Step 5: Commit** — `feat(web): start or continue a chat from the character page`

### Final gate

- [ ] Run lint and typecheck for `apps/api`, `apps/web` and `packages/shared`, one at a time, with `--max-old-space-size=2048`.
- [ ] Run `/do-tests` for the changed files.
