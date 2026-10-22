# Wanderer Plan 2: Characters and Discover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user creates, edits, imports, and publishes characters, and everyone finds them on Discover and opens their character pages, with the 18+ rules applied by the backend.

**Architecture:** The API adds characters, openings, tags, and uploaded files to Postgres, and keeps the avatar images on a disk volume behind a storage interface. The web app renders Discover and the character page on the Next.js server for visitors (no cookie), then the browser fetches again with the session for a logged-in user. All request and response shapes are Zod schemas in `packages/shared`.

**Tech Stack:** Plan 1 stack, plus `sharp` 0.35, `multer` 2 (through `@nestjs/platform-express` 12), `react-markdown` 10, `rehype-raw` 7, `rehype-sanitize` 6.

**Spec:** `docs/superpowers/specs/2026-10-21-wanderer-design.md` (sections 4.2, 4.3, 4.4, 4.7, 7, 8, 10, 11, and 13)

**Branch:** `feat/wanderer-02-characters-discover`, made from `feat/wanderer-01-foundation-login` (PR #1 is not merged yet). The PR goes to `dev` after PR #1.

## Changes to the plan series

| Item | Was | Now | Why |
|---|---|---|---|
| For you, Recent chats, model card, "Continue your chat", Start a new chat, Your chats | Plan 2 | Plan 3 | They need the chat tables of Plan 3. |
| Report button | Plan 2 (spec 4.3) | Plan 4 | Reports and admin are one part. |
| Log out in the user row | Plan 4 | Plan 2 | The sidebar user row comes now, and a user must be able to log out. |
| Settings page with "Show 18+" | Plan 4 | Plan 4 | Plan 2 gives the API and the 18+ warning page, which can turn on "Show 18+". |

## Global Constraints

- All Plan 1 Global Constraints stay in force (Node 24, pnpm 12, TypeScript ~6.0.3, Prisma 7.10, one test file at a time with `--maxWorkers=1`, ASD-STE100 comments).
- Avatar: PNG, JPEG, or WebP, 5 MB or less (`5 * 1024 * 1024` bytes). The API checks the real type with `sharp`, not the file name or the `Content-Type`. It stores only a new WebP copy, 600×800 (`fit: "cover"`), with no metadata. It never stores the original file.
- `sharp` gets `limitInputPixels: 40_000_000`, so a very large image cannot use all the memory.
- Field limits (shared Zod schema, the same rule on both sides): title 1–60 characters and unique for each creator; chat name 0–60 (empty means the title); bio 1–2,000; personality 1–8,000; scenario 0–4,000; example dialogs 0–8,000; openings 1–10, each 1–4,000; tags 0–10 from the tag list.
- The tag list (spec 13, the prototype tags): `adventure` Adventure, `fantasy` Fantasy, `horror` Horror, `military` Military, `mystery` Mystery, `noir` Noir, `post-apoc` PostApoc, `school` School, `sci-fi` SciFi, `slice-of-life` SliceOfLife.
- Token estimate: `estimateTokens(text) = Math.ceil(text.length / 4)`. "Permanent" counts the chat name (or the title), the personality, and the scenario. "Total" adds the bio, all openings, and the example dialogs.
- Visibility: `published` + public → everyone, with the 18+ rule. Private, `draft`, or `hidden` → only the creator (Plan 4 adds the admin). Another user gets 404, never 403, so the API does not show that a private character exists.
- 18+: a visitor never sees an 18+ character. A user sees one only when `showAdult` is true, and `showAdult` can be true only when `adultConfirmedAt` is set. List queries filter in Postgres. `GET /characters/:id` for a blocked 18+ character answers 403 `{ "error": "adult_content" }` with no other field.
- Markdown: `react-markdown` with `rehype-raw`, then `rehype-sanitize` with a schema that allows no HTML element except `u` (for the U button). Links allow only `http`, `https`, and `mailto`.
- Discover: search over title, chat name, tag labels, and creator handle, `ILIKE` with `%` and `_` escaped, 100 characters or less. One tag at a time. Sort `most_chats` (chat count, then newest) or `newest`. Page size 24, keyset cursor (opaque base64url).
- Files: `GET /files/:id` sends `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, and `Cache-Control: public, max-age=31536000, immutable`. File IDs are UUIDs.
- New env vars: api `UPLOAD_DIR` (default `./uploads`, in Docker `/data/uploads` on a Dokploy volume); web `API_INTERNAL_URL` (the API address that the Next.js server uses; default `NEXT_PUBLIC_API_URL`).

## Review Focus

1. **An 18+ character for a visitor, or for a user without "Show 18+".** A direct ID, a search, a tag filter, or the list must not show it. Test in Tasks 5 and 6.
2. **A file that is not a real image.** A text file named `.png`, an SVG, a file over 5 MB, or a 20,000×20,000 PNG gives 400 or 413, and the API stores nothing. Test in Task 3.
3. **Another user and a private, draft, or definition-hidden character.** They get 404 for edit, delete, and read, and the JSON has no personality, scenario, or example dialogs when the definition is hidden. Test in Task 4.
4. **Search text with `%`, `_`, or 500 characters.** `%` matches only a real `%`, and a long text gives 400, not a slow scan. Test in Task 5.
5. **A Tavern PNG with no card, broken base64, or broken JSON.** The API answers 400 `{ "error": "no_character_card" }` and stores no file. Test in Task 7.

---

### Task 1: Shared character schemas and the token estimate

**Files:**
- Create: `packages/shared/src/characters.ts`, `packages/shared/src/tokens.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/auth.ts` (add `showAdult: boolean` to `meResponseSchema`)
- Test: `packages/shared/src/characters.test.ts`

**Interfaces:**
- Produces: `TAGS: readonly { slug: string; label: string }[]` (the 10 tags above), `tagSlugSchema`, `characterInputSchema`, `characterListQuerySchema`, and the types `CharacterInput`, `CharacterCard`, `CharacterDetail`, `CharacterListQuery`, `CharacterListResponse`, `Tag`.
- `CharacterInput = { title; chatName: string; bio; tags: string[]; isAdult: boolean; personality; scenario: string; openings: string[]; exampleDialogs: string; avatarFileId: string | null; isPublic: boolean; definitionVisible: boolean; publish: boolean }`. The schema trims strings and drops duplicate tags.
- `CharacterCard = { id; title; chatName; avatarUrl: string | null; isAdult; tags: Tag[]; chatCount: number; creatorHandle: string }`. `avatarUrl` is a path such as `/files/<id>`.
- `CharacterDetail = CharacterCard & { bio; status: "draft" | "published" | "hidden"; isPublic; definitionVisible; openings: string[]; definition: { personality; scenario; exampleDialogs } | null; isOwner: boolean; createdAt: string }`.
- `TagSlug` is the union of the 10 slugs. `MyCharacterCard = CharacterCard & { status: CharacterDetail["status"]; isPublic: boolean }`, for My characters.
- `CharacterListQuery = { q?: string (≤100); tag?: TagSlug; sort: "most_chats" | "newest" (default "most_chats"); cursor?: string }`. `CharacterListResponse = { items: CharacterCard[]; nextCursor: string | null }`.
- `estimateTokens(text: string): number` and `characterTokenCounts(input: Pick<CharacterInput, "title" | "chatName" | "bio" | "personality" | "scenario" | "openings" | "exampleDialogs">): { permanent: number; total: number }`.

- [ ] **Step 1:** Write `characters.test.ts`:
  - `characterInputSchema accepts a minimal character` (title, bio, personality, one opening)
  - `it rejects a 61-character title, 0 openings, 11 openings, and 11 tags`
  - `it rejects the tag "romance"`, which is not in the list
  - `it drops a duplicate tag`
  - `characterListQuerySchema rejects a 101-character q and defaults sort to most_chats`
  - `estimateTokens("abcdefgh") is 2 and estimateTokens("abcdefghi") is 3`
  - `characterTokenCounts uses the title when the chat name is empty`
- [ ] **Step 2:** Run the check command. Expected: FAIL, because the exports do not exist.
- [ ] **Step 3:** Add the files. Rebuild the shared package (`pnpm --filter @wanderer/shared build`) after the change.
- [ ] **Step 4:** Run the check command. Expected: PASS, 7 tests.
- [ ] **Step 5:** Commit: `feat(shared): add the character schemas and the token estimate`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/shared exec vitest run src/characters.test.ts --maxWorkers=1`

### Task 2: Database tables for characters, openings, tags, and files

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: the migration from `prisma migrate dev --name characters`, with a hand-written `INSERT` of the 10 tags at its end
- Test: `apps/api/test/characters-schema.int.test.ts`

**Interfaces:**
- Produces: `User` gets `showAdult Boolean @default(false)` and `adultConfirmedAt DateTime?`.
- Produces: `Character` (`id`, `creatorId` → User cascade, `title`, `chatName`, `bio`, `personality`, `scenario`, `exampleDialogs`, `isAdult`, `isPublic`, `definitionVisible`, `status` enum `draft|published|hidden` default `draft`, `avatarFileId?` → File set null, `chatCount Int @default(0)`, `createdAt`, `updatedAt`; unique `(creatorId, title)`; index `(status, isPublic, isAdult, chatCount, createdAt)`).
- Produces: `CharacterOpening` (`id`, `characterId` cascade, `position`, `text`; unique `(characterId, position)`), `Tag` (`slug` id, `label` unique), `CharacterTag` (`characterId` cascade, `tagSlug`; id `(characterId, tagSlug)`), `File` (`id`, `ownerId` → User cascade, `path`, `mime`, `size`, `width`, `height`, `createdAt`). All with `@map` snake_case names, as in Plan 1.

- [ ] **Step 1:** Write `characters-schema.int.test.ts`:
  - `the migration adds the 10 tags`
  - `two characters with the same title for one creator fail with P2002`, and two creators can use the same title
  - `the delete of a character deletes its openings and tag links`
  - `the delete of a user deletes their characters and files`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Change the schema, run `prisma migrate dev --name characters`, add the tag `INSERT` to the new migration file, then run `prisma generate`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests. Also run `test/schema.int.test.ts`. Expected: PASS, 3 tests.
- [ ] **Step 5:** Commit: `feat(api): add the character, tag, and file tables`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/characters-schema.int.test.ts --maxWorkers=1`

### Task 3: Avatar upload and file serving

**Files:**
- Create: `apps/api/src/files/file-storage.ts`, `apps/api/src/files/image.ts`, `apps/api/src/files/files.controller.ts`, `apps/api/src/files/files.service.ts`
- Modify: `apps/api/src/config/env.ts` (`UPLOAD_DIR`), `apps/api/src/security/origin.guard.ts` (export `assertWebOrigin`), `apps/api/src/app.module.ts`
- Test: `apps/api/test/files.e2e.test.ts`

**Interfaces:**
- Produces: `FileStorage { save(key: string, data: Buffer): Promise<void>; read(key: string): Promise<Buffer>; remove(key: string): Promise<void> }`, the token `FILE_STORAGE`, and `LocalDiskStorage(rootDir: string)`. Keys are `<uuid>.webp`. Tests replace it with an in-memory class.
- Produces: `toAvatarWebp(input: Buffer): Promise<{ data: Buffer; width: 600; height: 800 }>`. It throws `InvalidImageError` for a type that is not PNG, JPEG, or WebP, and for an image over the pixel limit.
- Produces: `FilesService.saveAvatar(ownerId: string, input: Buffer): Promise<{ id: string; url: string }>`, used again by Task 7.
- Produces: `POST /files` (multipart field `file`, `SessionGuard`, `@SkipOriginCheck()` plus `assertWebOrigin(req, env)`, multer `memoryStorage` with `limits.fileSize = 5 * 1024 * 1024`, `@Throttle` 20 a minute) → 201 `{ id, url }`. `GET /files/:id` → the WebP with the headers in Global Constraints, 404 for an unknown ID.
- Produces: `assertWebOrigin(req: Request, env: Env): void`, which throws 403 `{ "error": "origin_not_allowed" }`.

- [ ] **Step 1:** Write `files.e2e.test.ts` (images made in the test with `sharp`):
  - `a PNG upload gives 201, and GET /files/:id gives a 600x800 WebP with no EXIF and the cache headers`
  - `a JPEG with EXIF GPS data comes back with no metadata`
  - Review Focus 2: `a text file named avatar.png gives 400 { error: "invalid_image" } and stores nothing`
  - Review Focus 2: `an SVG gives 400`, `a 6 MB file gives 413`, and `a 20000x20000 PNG gives 400`
  - `an upload without a session gives 401`, and `an upload with Origin https://evil.example gives 403`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Add `sharp` to `allowBuilds` in `pnpm-workspace.yaml` if pnpm asks for it.
- [ ] **Step 4:** Run the check command. Expected: PASS, 9 tests.
- [ ] **Step 5:** Commit: `feat(api): add avatar upload with image checks`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/files.e2e.test.ts --maxWorkers=1`

### Task 4: Create, read, update, and delete characters

**Files:**
- Create: `apps/api/src/characters/characters.controller.ts`, `apps/api/src/characters/characters.service.ts`, `apps/api/src/characters/character-mapper.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/characters.e2e.test.ts`

**Interfaces:**
- Consumes: `characterInputSchema`, `CharacterDetail` (Task 1), the tables (Task 2), `SessionGuard`, `@CurrentUser()` (Plan 1).
- Produces: an `OptionalSessionGuard` in `apps/api/src/auth/` that sets `req.user` when the cookie is valid and lets the request through when it is not. Tasks 5 and 6 use it.
- Produces: `POST /characters` → 201 `CharacterDetail`; `GET /characters/:id` (optional session) → `CharacterDetail`; `PATCH /characters/:id` (owner) → `CharacterDetail`; `DELETE /characters/:id` (owner) → 204, and it removes the avatar file too.
- Rules: `publish: true` sets `status` to `published`, `publish: false` sets `draft`. A title that the creator already uses gives 409 `{ "error": "title_taken" }` (catch `P2002`). An `avatarFileId` of another user gives 400 `{ "error": "invalid_avatar" }`. Validation errors give 400 `{ "error": "invalid_character", "fields": string[] }`. An owner edit of a `hidden` character keeps it `hidden`.
- Produces: `toCharacterDetail(row, viewer: User | null): CharacterDetail`, which sets `definition` to null when `definitionVisible` is false and the viewer is not the owner.

- [ ] **Step 1:** Write `characters.e2e.test.ts`:
  - `POST /characters with publish false saves a private draft`, and `with publish true and isPublic true it is published`
  - `the openings keep their order`, and `PATCH with three openings in a new order saves that order`
  - `a second character with the same title for the same creator gives 409 title_taken`
  - `an avatarFileId of another user gives 400 invalid_avatar`
  - Review Focus 3: `another user gets 404 for GET, PATCH, and DELETE of a draft, and for GET of a private character`
  - Review Focus 3: `another user gets definition null when definitionVisible is false, and the owner gets the definition`
  - `DELETE by the owner gives 204 and removes the avatar file from the storage`
  - `POST without the web Origin gives 403` (the Plan 1 origin check)
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Write the character, the openings, and the tags in one `prisma.$transaction`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 10 tests.
- [ ] **Step 5:** Commit: `feat(api): let users create, edit, and delete characters`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/characters.e2e.test.ts --maxWorkers=1`

### Task 5: Discover list, search, tags, and My characters

**Files:**
- Create: `apps/api/src/characters/character-list.service.ts`, `apps/api/src/characters/cursor.ts`, `apps/api/src/tags/tags.controller.ts`
- Modify: `apps/api/src/characters/characters.controller.ts`
- Test: `apps/api/test/discover.e2e.test.ts`

**Interfaces:**
- Consumes: `characterListQuerySchema`, `CharacterListResponse` (Task 1), `OptionalSessionGuard` (Task 4).
- Produces: `GET /characters?q=&tag=&sort=&cursor=` (optional session) → `CharacterListResponse`, only `published` and public characters, 24 for each page. `GET /tags` → `Tag[]` in label order. `GET /me/characters` (session) → all characters of the user, newest first, as `MyCharacterCard[]`.
- Produces: `encodeCursor(key: { chatCount: number; createdAt: string; id: string }): string` and `decodeCursor(cursor: string): ... | null`. A bad cursor gives 400 `{ "error": "invalid_cursor" }`.
- The 18+ filter lives in the `WHERE` of the query: `isAdult = false` unless the viewer has `showAdult` true.

- [ ] **Step 1:** Write `discover.e2e.test.ts` with 30 seeded characters:
  - `the list gives 24 items and a nextCursor, and the next page gives the other public ones with no repeat`
  - `sort most_chats orders by chat count, and sort newest by creation time`
  - `tag=noir gives only noir characters`
  - `q matches the title, the chat name, a tag label, and the creator handle`
  - Review Focus 4: `q="100%" matches only a title with "100%", q="a_b" does not match "axb", and a 101-character q gives 400`
  - Review Focus 1: `a visitor, and a user with showAdult false, get no 18+ character from the list, a search, or a tag filter`
  - `a user with showAdult true gets the 18+ characters`
  - `drafts and private characters are not in the list, but GET /me/characters shows them to their creator`
  - `GET /tags gives the 10 tags`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Escape `\`, `%`, and `_` in `q` before `ILIKE`, with `ESCAPE '\'`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 9 tests.
- [ ] **Step 5:** Commit: `feat(api): add the Discover list, search, and tag filter`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/discover.e2e.test.ts --maxWorkers=1`

### Task 6: The 18+ setting and the 18+ gate on a character

**Files:**
- Modify: `apps/api/src/me/me.controller.ts`, `apps/api/src/me/me.service.ts`, `apps/api/src/characters/characters.service.ts`
- Test: `apps/api/test/adult.e2e.test.ts`

**Interfaces:**
- Consumes: `meResponseSchema` with `showAdult` (Task 1).
- Produces: `POST /me/adult-confirm` → sets `adultConfirmedAt` (first time only) and `showAdult` true, returns `MeResponse`. `PATCH /me` accepts `{ handle?: string; showAdult?: boolean }`; `showAdult: true` without `adultConfirmedAt` gives 400 `{ "error": "adult_not_confirmed" }`.
- Produces: `GET /characters/:id` for an 18+ character gives 403 `{ "error": "adult_content" }` to a visitor and to a user with `showAdult` false. The owner always gets their own character.

- [ ] **Step 1:** Write `adult.e2e.test.ts`:
  - Review Focus 1: `a visitor gets 403 adult_content for an 18+ character, and the body has no other field`
  - `a user with showAdult false gets 403 adult_content`, and `the creator gets their own 18+ character`
  - `PATCH /me showAdult true before the confirm gives 400 adult_not_confirmed`
  - `POST /me/adult-confirm saves the time one time, and a second call keeps the first time`
  - `after the confirm, the same GET gives the character`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Change the files.
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests. Also run `test/me.e2e.test.ts`. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): add the 18+ confirm and the 18+ gate`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/adult.e2e.test.ts --maxWorkers=1`

### Task 7: Tavern PNG import

**Files:**
- Create: `apps/api/src/characters/tavern-card.ts`
- Modify: `apps/api/src/characters/characters.controller.ts`
- Test: `apps/api/src/characters/tavern-card.test.ts`, `apps/api/test/import-png.e2e.test.ts`

**Interfaces:**
- Consumes: `FilesService.saveAvatar` (Task 3), `characterInputSchema` (Task 1).
- Produces: `readTavernCard(png: Buffer): Partial<CharacterInput> | null`. It reads the `tEXt` and `iTXt` chunks, prefers `ccv3` over `chara`, base64-decodes the JSON, and maps `data.name` → title, `data.description` → personality, `data.personality` → appended to personality, `data.scenario`, `data.first_mes` and `data.alternate_greetings` → openings (10 or less), `data.mes_example` → exampleDialogs, `data.creator_notes` → bio, and `data.tags` → only the tags whose label or slug is in the tag list. Text over a field limit is cut to the limit.
- Produces: `POST /characters/import-png` (multipart `file`, the same origin check and limits as `POST /files`) → 200 `{ draft: Partial<CharacterInput>; avatarFileId: string }`. It creates no character; the form saves it later.

- [ ] **Step 1:** Write `tavern-card.test.ts` (the test builds a PNG with `sharp` and adds a `tEXt` chunk):
  - `a V2 chara chunk gives the title, personality, scenario, openings, and example dialogs`
  - `a ccv3 chunk wins over a chara chunk in the same file`
  - `alternate greetings become openings 2 to 10`, and `an unknown tag is dropped`
  - Review Focus 5: `a PNG with no card, broken base64, or broken JSON gives null`
- [ ] **Step 2:** Write `import-png.e2e.test.ts`:
  - `a card PNG gives 200 with the draft and an avatarFileId that GET /files/:id serves`
  - Review Focus 5: `a PNG with no card gives 400 no_character_card and stores no file`
- [ ] **Step 3:** Run both check commands. Expected: FAIL.
- [ ] **Step 4:** Add the files. Read the chunks with a small loop over the PNG bytes (length, type, data, CRC). Do not add a PNG library.
- [ ] **Step 5:** Run both check commands. Expected: PASS, 5 and 2 tests.
- [ ] **Step 6:** Commit: `feat(api): import Tavern character cards from PNG files`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run src/characters/tavern-card.test.ts --maxWorkers=1`, then the same for `test/import-png.e2e.test.ts`

### Task 8: Full sidebar, user row, and the Markdown view

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/sidebar-nav.tsx`, `apps/web/src/components/user-row.tsx`, `apps/web/src/components/markdown.tsx`
- Test: `apps/web/src/components/sidebar.test.tsx`, `apps/web/src/components/markdown.test.tsx`

**Interfaces:**
- Consumes: `useMe()`, `apiFetch` (Plan 1).
- Produces: the prototype sidebar: the logo, the "Create" pill (link to `/create`), and nav links Discover (`/`) and My characters (`/my-characters`), with `aria-current="page"` on the current one. At the foot, the user row: the picture or the first letter, the name, `@handle`, and a menu with "Log out" (`POST /auth/logout`, then clear the `["me"]` cache and go to `/login`). A visitor sees a "Log in" pill in place of the user row. Plan 3 adds For you, Recent, and the model card.
- Produces: `<Markdown text: string />` with the plugins and the schema in Global Constraints.

- [ ] **Step 1:** Write `sidebar.test.tsx`:
  - `the sidebar shows Create, Discover, and My characters, and marks the current page`
  - `a logged-in user sees their @handle, and Log out calls POST /auth/logout and goes to /login`
  - `a visitor sees a Log in link to /login and no user row`
- [ ] **Step 2:** Write `markdown.test.tsx`:
  - `**bold**, *italic*, <u>under</u>, and [link](https://a.b) render as strong, em, u, and a`
  - `<script>, <img onerror>, and a javascript: link render as plain text or nothing`
- [ ] **Step 3:** Run both check commands. Expected: FAIL.
- [ ] **Step 4:** Add the files. Copy the classes `.nav`, `.side-nav`, `.side-foot`, and `.pill-soft` from the prototype (`App.dc.html` in the canvas) into `globals.css`.
- [ ] **Step 5:** Run both check commands. Expected: PASS, 3 and 2 tests.
- [ ] **Step 6:** Commit: `feat(web): add the full sidebar, the user row, and the Markdown view`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/components/sidebar.test.tsx --maxWorkers=1`, then `src/components/markdown.test.tsx`

### Task 9: Discover page

**Files:**
- Modify: `apps/web/src/app/(shell)/page.tsx`
- Create: `apps/web/src/components/character-card.tsx`, `apps/web/src/app/(shell)/discover-view.tsx`, `apps/web/src/lib/server-api.ts`
- Test: `apps/web/src/components/character-card.test.tsx`, `apps/web/src/app/(shell)/discover-view.test.tsx`

**Interfaces:**
- Consumes: `CharacterListResponse`, `TAGS` (Task 1), `GET /characters`, `GET /tags` (Task 5).
- Produces: `serverApiFetch<T>(path: string): Promise<T>`, which uses `API_INTERNAL_URL` with no cookie and `cache: "no-store"`.
- Produces: `<CharacterCard card: CharacterCard />` in the prototype StoryEngine style: a tall 3:4 image (or the first letter on a surface), the chat count badge, the 18+ badge, the title, up to 3 tags, and `@creator`. The whole card links to `/characters/<id>`.
- Produces: `<DiscoverView initial: CharacterListResponse />`. The page reads `q`, `tag`, and `sort` from the URL. The server renders the visitor list. In the browser, `useInfiniteQuery` with key `["characters", q, tag, sort]` fetches again with the session when `useMe()` gives a user. It shows "Welcome back, {name}" for a user, the search field, the tag chips ("All" and the 10 tags, one at a time), the sort switch "Most chats" / "Newest", the card grid that fills the width, a "Load more" button, and the empty text "No characters match your search."

- [ ] **Step 1:** Write `character-card.test.tsx`:
  - `a card with no avatar shows the first letter of the title`
  - `a card shows the chat count, up to 3 tags, @creator, and an 18+ badge only for an 18+ character`
- [ ] **Step 2:** Write `discover-view.test.tsx` (fake `fetch`, fake router):
  - `a click on the Noir chip puts tag=noir in the URL`, and `a second click goes back to All`
  - `a search text puts q in the URL after a 300 ms pause`
  - `Load more asks for the next cursor and adds the cards`
  - `an empty list shows "No characters match your search."`
- [ ] **Step 3:** Run both check commands. Expected: FAIL.
- [ ] **Step 4:** Add the files, with the prototype classes `.chip` and `.tag` in `globals.css`.
- [ ] **Step 5:** Run both check commands. Expected: PASS, 2 and 5 tests.
- [ ] **Step 6:** Commit: `feat(web): add the Discover page with search and tag filters`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/components/character-card.test.tsx --maxWorkers=1`, then `src/app/(shell)/discover-view.test.tsx`

### Task 10: Character page, owner panel, and the 18+ warning

**Files:**
- Create: `apps/web/src/app/(shell)/characters/[id]/page.tsx`, `apps/web/src/app/(shell)/characters/[id]/character-view.tsx`, `apps/web/src/app/(shell)/characters/[id]/adult-warning.tsx`, `apps/web/src/app/(shell)/characters/[id]/owner-panel.tsx`
- Test: `apps/web/src/app/(shell)/characters/[id]/character-view.test.tsx`

**Interfaces:**
- Consumes: `CharacterDetail` (Task 1), `GET`, `PATCH`, `DELETE /characters/:id` (Task 4), `POST /me/adult-confirm` (Task 6), `<Markdown />` (Task 8).
- Produces: the page renders on the server for a public character. When the server gets 404 or 403 `adult_content`, the browser tries again with the session. A real 404 shows "This character does not exist or is private."
- Produces: `<CharacterView detail />` with the prototype banner (a blurred copy of the image behind the image), the title, "Chat with {chatName}", `@creator`, the chat count, the bio in Markdown, the tags, the 18+ badge, "How the story starts" with the openings, and "Definition" with the personality and the scenario, or the text "The creator keeps the definition of this character hidden."
- Produces: `<OwnerPanel detail />` for the owner: switches "Public" and "Definition visible" (each saves with `PATCH`), an "Edit" link to `/characters/<id>/edit`, and "Delete" with a confirm step on the page ("Delete {title}? This cannot be undone." with Delete and Cancel). Delete goes to `/my-characters`.
- Produces: `<AdultWarning />`: "This character is 18+." A user sees "I am 18 or older. Show 18+ content." (calls `POST /me/adult-confirm`, then loads the character). A visitor sees "Log in to continue."

- [ ] **Step 1:** Write `character-view.test.tsx`:
  - `the view shows the title, "Chat with" the chat name, @creator, the bio, the tags, and the openings`
  - `definition null shows "The creator keeps the definition of this character hidden."`
  - `the owner panel shows only for the owner, and the Public switch sends PATCH { isPublic: false }`
  - `Delete asks first, Cancel keeps the character, and the second Delete sends DELETE and goes to /my-characters`
  - `the 18+ warning button calls POST /me/adult-confirm and then shows the character`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(web): add the character page with the owner panel and the 18+ warning`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/characters/[id]/character-view.test.tsx" --maxWorkers=1`

### Task 11: Character form: fields, openings, token counts, and save

**Files:**
- Create: `apps/web/src/components/character-form/character-form.tsx`, `apps/web/src/components/character-form/openings-editor.tsx`, `apps/web/src/app/(shell)/create/page.tsx`, `apps/web/src/app/(shell)/characters/[id]/edit/page.tsx`
- Test: `apps/web/src/components/character-form/character-form.test.tsx`

**Interfaces:**
- Consumes: `characterInputSchema`, `characterTokenCounts`, `TAGS` (Task 1), `POST` and `PATCH /characters` (Task 4).
- Produces: `<CharacterForm initial?: CharacterDetail; onSaved: (detail: CharacterDetail) => void />` with the fields in the spec 4.4 order: Avatar (slot for Task 12), Title, Chat name, Bio (slot for the Task 12 toolbar), Tags (chips, 10 or less), 18+ switch, Personality (token count), Scenario (token count), Initial messages, Example dialogs (hint "Use {{char}} and {{user}}."), Public, and Definition visible. The footer shows "Total: X tokens. Permanent: Y tokens." and the buttons "Save draft" and "Publish".
- Produces: `<OpeningsEditor value: string[]; onChange />` with tabs "Message 1"…, Add (stops at 10), Move left, Move right, Delete (stops at 1), and Write / Preview (Preview uses `<Markdown />`).
- Errors: a field error from the schema shows under the field. A 409 `title_taken` shows "You already have a character with this title." under Title.

- [ ] **Step 1:** Write `character-form.test.tsx`:
  - `the fields come in the spec order`
  - `the footer counts update as the user types, and Permanent uses the title when the chat name is empty`
  - `Add stops at 10 openings, Delete stops at 1, and Move right swaps two tabs`
  - `the 11th tag chip cannot be picked`
  - `Save draft sends publish false, and Publish sends publish true`
  - `a 409 title_taken shows "You already have a character with this title."`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. `/create` and `/characters/<id>/edit` send a user without a session to `/login`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests.
- [ ] **Step 5:** Commit: `feat(web): add the character form with openings and token counts`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/components/character-form/character-form.test.tsx --maxWorkers=1`

### Task 12: Character form: avatar, bio toolbar, Tavern import, and live preview

**Files:**
- Create: `apps/web/src/components/character-form/avatar-field.tsx`, `apps/web/src/components/character-form/bio-toolbar.tsx`, `apps/web/src/components/character-form/tavern-import.tsx`
- Modify: `apps/web/src/components/character-form/character-form.tsx`
- Test: `apps/web/src/components/character-form/form-extras.test.tsx`

**Interfaces:**
- Consumes: `POST /files` (Task 3), `POST /characters/import-png` (Task 7), `<CharacterCard />` (Task 9).
- Produces: `<AvatarField value: string | null; onChange />`. It checks the type (PNG, JPEG, WebP) and the size (5 MB) before the upload, shows "Use a PNG, JPEG, or WebP image of 5 MB or less." for a bad file, and shows the new image after the upload.
- Produces: `<BioToolbar textareaRef />` with B (`**…**`), I (`*…*`), U (`<u>…</u>`), and Link (`[text](https://)`), each around the selected text.
- Produces: `<TavernImport onImported: (draft, avatarFileId) => void />` ("Import a Tavern PNG"). It fills the form and keeps the fields that the card does not have. A 400 shows "This PNG has no character card."
- The live preview: a `<CharacterCard />` on the right that changes as the user types (on a phone, it goes under the form).

- [ ] **Step 1:** Write `form-extras.test.tsx`:
  - `a 6 MB file shows the size message and sends no request`
  - `B around the selected word "brave" makes "**brave**"`, and `U makes "<u>brave</u>"`
  - `a Tavern import fills the title and the openings and keeps a typed scenario that the card does not have`
  - `a 400 import answer shows "This PNG has no character card."`
  - `the preview card shows the new title while the user types`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files.
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests. Also run `character-form.test.tsx`. Expected: PASS, 6 tests.
- [ ] **Step 5:** Commit: `feat(web): add avatar upload, the bio toolbar, Tavern import, and the preview`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/components/character-form/form-extras.test.tsx --maxWorkers=1`

### Task 13: My characters, the dev seed, and the deploy changes

**Files:**
- Create: `apps/web/src/app/(shell)/my-characters/page.tsx`, `apps/api/prisma/seed-dev.ts`
- Modify: `apps/api/package.json` (`seed:dev` script), `apps/api/Dockerfile` (make `/data/uploads` owned by `node`), `docs/deploy.md`
- Test: `apps/web/src/app/(shell)/my-characters/my-characters.test.tsx`

**Interfaces:**
- Consumes: `GET /me/characters` (Task 5), `<CharacterCard />` (Task 9).
- Produces: `/my-characters` with the user's characters, a status label on each card (Draft, Private, Published, Hidden), and the empty text "You have no characters yet." with a "Create a character" pill. A visitor goes to `/login`.
- Produces: `pnpm --filter @wanderer/api seed:dev`, which refuses to run unless `DATABASE_URL` points to `localhost`. It makes the user `@wanderer_dev` and 8 published characters with no image, across the tags, one of them 18+. It does not use the prototype images (spec 13).
- Produces: `docs/deploy.md` adds the Dokploy volume `/data/uploads` for the API, `UPLOAD_DIR=/data/uploads`, `API_INTERNAL_URL` for the web app, and the uploads backup to R2.

- [ ] **Step 1:** Write `my-characters.test.tsx`:
  - `each card shows its status label`
  - `no characters shows "You have no characters yet." and a link to /create`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Run `seed:dev` one time against the local database. Expected: 8 characters on Discover.
- [ ] **Step 4:** Run the check command. Expected: PASS, 2 tests. Run `docker build -f apps/api/Dockerfile -t wanderer-api .`. Expected: the build completes.
- [ ] **Step 5:** Commit: `feat(web): add My characters, the dev seed, and the upload volume`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/my-characters/my-characters.test.tsx" --maxWorkers=1`

---

## Done for Plan 2

- Each task check passes.
- One full gate at the end, one command at a time: typecheck, lint, every test file with its own check command, both builds, and both Docker builds.
- The browser checks in Brave through DevTools: create a character with an avatar, publish it, find it by search and by tag, open its page, turn the definition off, and check the 18+ warning as a visitor.
- One review of the whole branch, such as `/code-review`. Tasks 3, 4, 5, and 6 touch uploads, access rules, and 18+ filters, so they get a review each on the strongest model, when the owner allows subagents.
