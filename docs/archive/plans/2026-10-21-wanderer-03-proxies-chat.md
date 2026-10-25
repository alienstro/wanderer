# Wanderer Plan 3: Proxies and Chat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user adds an OpenAI-compatible proxy, starts a chat with a character from one of its openings, and gets streamed replies, Regenerate, message edit and delete, and four reply choices.

**Architecture:** The API keeps proxies with the API key encrypted (AES-256-GCM), and calls each proxy through the `openai` SDK with an undici `fetch` whose DNS lookup refuses private addresses and pins the checked IP. A reply streams to the browser as Server-Sent Events from a `POST`, so the browser reads the stream with `fetch`, not `EventSource`. All request, response, and stream event shapes are Zod schemas or types in `packages/shared`.

**Tech Stack:** Plan 2 stack, plus `openai` 7.30.0 and `undici` 8.11.2. Both versions are more than two weeks old on 2026-10-21. Do not take a newer version without a reason.

**Spec:** `docs/superpowers/specs/2026-10-21-wanderer-design.md` (sections 4.2, 4.3, 4.5, 4.6, 7, 8, 9, and 10)

**Branch:** `feat/wanderer-03-proxies-chat`, made from `dev` after the merge of PR #2. The PR goes to `dev`. Push with `git push -u origin HEAD`, because the branch now tracks `origin/dev`.

## Changes to the plan series

| Item | Was | Now | Why |
|---|---|---|---|
| For you, Recent chats, model card, "Welcome back" and "Continue your chat", Start a new chat, Your chats | Plan 2 | Plan 3 (Tasks 13 to 20) | They need the chat tables. |
| Test of a proxy that is not saved | Not in spec | Not in Plan 3 | The spec lists only `POST /proxies/:id/test`. The form saves first, then tests. |
| A chat whose character is now private or 18+-blocked | Not in spec | My call: the user can read it, but send, Regenerate, and choices give 404 | The prompt needs the definition, and the creator chose to hide the character. |

## Global Constraints

- All Plan 1 and Plan 2 Global Constraints stay in force (Node 24, pnpm 12, TypeScript ~6.0.3, Prisma 7.10, one test file at a time with `--maxWorkers=1`, ASD-STE100 comments, `NODE_OPTIONS=--max-old-space-size=1024` for tests).
- New env var: api `KEY_ENCRYPTION_KEY`, the base64 text of exactly 32 random bytes (`openssl rand -base64 32`). The API does not start without it. Tests use a fixed test value.
- Key encryption: `aes-256-gcm`, a new 12-byte IV for each save, a 16-byte tag, AAD = `proxy:<proxyId>`, `keyVersion = 1`. The API decrypts a key only in the call to the proxy. No response, log, or error text contains a key. `keyLast4` is the last 4 characters of the key.
- Proxy fields: name 1–60; `baseUrl` an `https` URL, 500 characters or less, no user name or password, no `#`, trailing `/` removed; `appendPath` boolean (default true); model 1–200; custom prompt 0–4,000; API key 1–500 on create, and optional on update (empty or absent keeps the saved key). A user has 20 proxies or less (409 `{ "error": "proxy_limit" }`).
- Endpoint: `appendPath ? baseUrl + "/chat/completions" : baseUrl`. The client sends every request to this endpoint, whatever path the SDK builds.
- SSRF guard: refuse `localhost` and each name that ends in `.localhost`. Resolve the host with `dns.lookup(host, { all: true })`. Allow an address only when its `ipaddr.js` range is `"unicast"`. An IPv4-mapped IPv6 address gets the IPv4 check. When any resolved address is blocked, refuse the call. The undici `Agent` uses this lookup in `connect.lookup`, so the socket goes to the checked IP. `redirect: "error"`, `maxRetries: 0`.
- Time limits: 30,000 ms to the first piece, 180,000 ms for the full reply, an SSE comment `: ping` every 15,000 ms. Tests can change these through the `REPLY_TIMING` token.
- Context budget: `estimateTokens` from Plan 2. The system message always goes in. Then the newest messages go in, newest first, while the total stays at 16,000 tokens or less. The newest message always goes in, also when it is over the budget.
- Roleplay instruction (exact text, then the parts below it, each with its heading, empty parts left out):
  `You are {{char}} in a roleplay with {{user}}. Stay in character. Write only the reply of {{char}}. Do not write the words or actions of {{user}}.`
  Then `## Instructions` (custom prompt), `## Personality`, `## Scenario`, `## Example dialogs`. The API replaces `{{char}}` with the chat name (or the title) and `{{user}}` with the user's name, in all parts and all messages.
- Reply choices instruction (exact text, as the last `user` message): `Write four short replies that {{user}} could say next, in the voice of {{user}}. Each reply has 25 words or less. Answer only with a JSON array of four strings.` `max_tokens: 400`. The API removes a Markdown code fence around the answer before `JSON.parse`. A valid answer is an array of exactly 4 strings, each 1–300 characters after trim. One more try after a bad answer, then 502 `{ "error": "choices_failed" }`.
- Proxy Test: one non-stream call with the message `Reply with the word OK.` and `max_tokens: 5`, 30,000 ms limit. The answer is 200 `{ ok: true, reply, latencyMs }` or 200 `{ ok: false, error, message }`.
- AI error codes (`AiErrorCode`) and the text for each, in `packages/shared`:
  `no_active_proxy` "Add a model in Settings to start chatting.", `invalid_key` (401, 403) "The proxy refused the API key.", `model_not_found` (404) "The proxy does not know this model.", `no_credit` (402, or 429 with code `insufficient_quota`) "The proxy account has no credit.", `rate_limited` (429) "The proxy has too many requests. Try again soon.", `timeout` "The proxy did not answer in time.", `blocked_url` "This proxy URL is not allowed.", `provider_unreachable` (DNS, TLS, connect, or redirect failure) "Wanderer cannot reach the proxy.", `provider_error` (all other errors) "The proxy gave an error."
- Errors from the SDK go to the log only as `{ status, code }`. Never log the SDK error object, because it can hold headers.
- Messages: content 1–8,000 characters after trim. Only `user` messages can be edited or deleted, by the owner of the chat. An edit sets `editedAt` and does not start a reply. The opening is message position 0 with role `assistant`. Positions go up by one and can have gaps after a delete.
- Regenerate: when the last message is an `assistant` message at position > 0, the new reply replaces its content (same ID) at the end of the stream. When the last message is a `user` message, it makes a new reply. Else 409 `{ "error": "nothing_to_regenerate" }`. When the new reply has no text (an error or a Stop before the first piece), the old reply stays.
- One stream for each chat at a time: an in-memory set of chat IDs, so a second stream gets 409 `{ "error": "chat_busy" }`. This works because the API runs as one container (spec section 11). A second API container needs a Postgres lock.
- Rate limits: messages and Regenerate 30 each minute for each user, choices 30 each minute for each user, proxy Test 10 each minute for each user. A new throttler named `user` counts by user ID. The IP guard skips it.
- SSE response headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`. Each event is one `data: <json>\n\n` line.
- `chatCount` goes up by one for each new chat, in the same transaction as the chat. It does not go down when a chat is deleted.
- The chat title is the chat name of the character, or the title when the chat name is empty.

## Review Focus

1. **A proxy URL that reaches the owner's network.** `https://127.0.0.1`, `https://[::1]`, `https://169.254.169.254`, `https://10.0.0.5`, `https://[::ffff:10.0.0.5]`, `https://localhost`, `http://api.example.com`, and a host name that resolves to `192.168.1.1` all fail with `blocked_url`, and the API sends no request. Test in Tasks 4 and 5.
2. **A saved key that leaks.** No `GET /proxies`, `POST`, `PATCH`, Test, or error response holds the key or the ciphertext, and a ciphertext moved to another proxy row does not decrypt. Test in Tasks 3 and 6.
3. **Another user and a chat, a message, or a proxy that is not theirs.** Read, send, edit, delete, Regenerate, choices, Test, and activate give 404. Test in Tasks 6, 8, and 9.
4. **A Stop or an error in the middle of a reply.** The part that came is saved; a Regenerate with no text keeps the old reply; a second stream in the same chat gets 409; the busy mark goes away after an error. Test in Tasks 9 and 10.
5. **A proxy that answers badly for choices.** Prose, a fenced JSON array, three items, or an empty string: the API tries one more time, then gives 502, and the chat still works. Test in Task 11.

---

### Task 1: Shared proxy and chat schemas

**Files:**
- Create: `packages/shared/src/proxies.ts`, `packages/shared/src/chats.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/auth.ts` (add `replyChoicesOn: boolean` and `activeProxy: { id; name; model } | null` to `meResponseSchema`, and `replyChoicesOn: z.boolean().optional()` to `updateMeRequestSchema`)
- Test: `packages/shared/src/chats.test.ts`

**Interfaces:**
- Produces: `proxyCreateSchema`, `proxyUpdateSchema` (all fields optional), and the types `ProxyCreate`, `ProxyUpdate`, `ProxyView = { id; name; baseUrl; appendPath; model; customPrompt; keyLast4; isActive: boolean; createdAt: string }`, `ProxyTestResult = { ok: true; reply: string; latencyMs: number } | { ok: false; error: AiErrorCode; message: string }`.
- Produces: `AI_ERROR_CODES`, `AiErrorCode`, `AI_ERROR_TEXT: Record<AiErrorCode, string>` (Global Constraints).
- Produces: `createChatSchema = { characterId: uuid; openingIndex: int 0–9 }`, `messageInputSchema = { content }`, and the types `MessageView = { id; role: "user" | "assistant"; content; position: number; editedAt: string | null; createdAt: string }`, `ChatSummary = { id; title; character: { id; title; chatName; avatarUrl: string | null }; lastMessage: string; lastMessageAt: string }` (`lastMessage` is cut to 140 characters), `ChatDetail = { chat: ChatSummary; messages: MessageView[]; canSend: boolean }`, `ChatListResponse = { items: ChatSummary[] }`, `ChoicesResponse = { choices: string[] }`.
- Produces: `ChatStreamEvent = { type: "start"; userMessage: MessageView | null } | { type: "delta"; text: string } | { type: "done"; message: MessageView } | { type: "error"; error: AiErrorCode; message: MessageView | null }`.

- [ ] **Step 1:** Write `chats.test.ts`:
  - `proxyCreateSchema accepts a minimal https proxy and trims the trailing slash`
  - `it rejects http, a user:pass URL, a URL with #, a 501-character URL, and an empty key`
  - `proxyUpdateSchema accepts an empty object`
  - `messageInputSchema rejects "   " and an 8,001-character message`
  - `createChatSchema rejects openingIndex 10`
  - `AI_ERROR_TEXT has a text for each code`
- [ ] **Step 2:** Run the check command. Expected: FAIL, because the exports do not exist.
- [ ] **Step 3:** Add the files. Rebuild the shared package (`pnpm --filter @wanderer/shared build`).
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests.
- [ ] **Step 5:** Commit: `feat(shared): add the proxy and chat schemas`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/shared exec vitest run src/chats.test.ts --maxWorkers=1`

### Task 2: Database tables for proxies, chats, and messages

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: the migration from `prisma migrate dev --name proxies_chats`
- Test: `apps/api/test/chats-schema.int.test.ts`

**Interfaces:**
- Produces: `User` gets `replyChoicesOn Boolean @default(true)` and `activeProxyId String? @unique` → `Proxy` with `onDelete: SetNull` (a named relation, because `Proxy` also has `userId`).
- Produces: `Proxy` (`id`, `userId` → User cascade, `name`, `baseUrl`, `appendPath Boolean @default(true)`, `model`, `customPrompt @default("")`, `keyCiphertext Bytes`, `keyIv Bytes`, `keyTag Bytes`, `keyVersion Int`, `keyLast4`, `createdAt`, `updatedAt`; index `userId`).
- Produces: `Chat` (`id`, `userId` → User cascade, `characterId` → Character cascade, `title`, `lastMessageAt @default(now())`, `createdAt`; index `(userId, lastMessageAt)` and `(userId, characterId)`).
- Produces: `MessageRole` enum `user|assistant`, and `Message` (`id`, `chatId` → Chat cascade, `role`, `content`, `position Int`, `editedAt DateTime?`, `createdAt`; unique `(chatId, position)`). All with `@map` snake_case names.

- [ ] **Step 1:** Write `chats-schema.int.test.ts`:
  - `two messages with one position in one chat fail with P2002`
  - `the delete of a character deletes its chats and messages`
  - `the delete of the active proxy sets activeProxyId to null`
  - `the delete of a user deletes their proxies and chats`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Change the schema, run `prisma migrate dev --name proxies_chats`, then `prisma generate`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests. Also run `test/characters-schema.int.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): add the proxy, chat, and message tables`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/chats-schema.int.test.ts --maxWorkers=1`

### Task 3: API key encryption

**Files:**
- Create: `apps/api/src/proxies/key-cipher.ts`
- Modify: `apps/api/src/config/env.ts` (`KEY_ENCRYPTION_KEY`, decoded to a 32-byte `Buffer`), `apps/api/test/support/env.ts` (a fixed test key), `apps/api/.env.docker.example`
- Test: `apps/api/src/proxies/key-cipher.test.ts`

**Interfaces:**
- Produces: `KeyCipher(masterKey: Buffer)` with `encrypt(plain: string, proxyId: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer; version: 1 }` and `decrypt(sealed: { ciphertext; iv; tag; version }, proxyId: string): string`. It throws `KeyDecryptError` for a wrong tag, a wrong AAD, or an unknown version. The Nest token is `KEY_CIPHER`.
- Produces: `env.KEY_ENCRYPTION_KEY: Buffer`.

- [ ] **Step 1:** Write `key-cipher.test.ts`:
  - `decrypt gives back the text that encrypt sealed`
  - `two encrypts of one key give two different IVs and ciphertexts`
  - Review Focus 2: `decrypt with another proxy ID throws KeyDecryptError`
  - `decrypt with a changed tag throws KeyDecryptError`
  - `loadEnv refuses a KEY_ENCRYPTION_KEY of 31 bytes and a missing one`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Use `node:crypto` `createCipheriv("aes-256-gcm", key, iv)` with `setAAD`. Add `KEY_ENCRYPTION_KEY=` with the comment `# openssl rand -base64 32` to `.env.docker.example`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): encrypt proxy API keys with AES-256-GCM`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run src/proxies/key-cipher.test.ts --maxWorkers=1`

### Task 4: SSRF guard

**Files:**
- Create: `apps/api/src/ai/url-guard.ts`
- Test: `apps/api/src/ai/url-guard.test.ts`

**Interfaces:**
- Produces: `isBlockedAddress(ip: string): boolean`, `assertProxyUrl(url: string): void` (the static check: `https`, no `localhost`, no blocked IP literal), and `createGuardedLookup(resolve?: (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>)`, which gives a function with the `net.LookupFunction` signature. The default `resolve` is `dns.promises.lookup(host, { all: true })`. All three throw or call back with `BlockedUrlError`.

- [ ] **Step 1:** Write `url-guard.test.ts`:
  - Review Focus 1: `isBlockedAddress is true for 127.0.0.1, 10.0.0.5, 172.16.0.1, 192.168.1.1, 100.64.0.1, 169.254.169.254, 0.0.0.0, ::1, fc00::1, fe80::1, and ::ffff:10.0.0.5`
  - `isBlockedAddress is false for 8.8.8.8 and 2606:4700::1111`
  - Review Focus 1: `assertProxyUrl refuses http, localhost, a.localhost, https://127.0.0.1, and https://[::1]`
  - `the guarded lookup calls back with the address when the host resolves to 8.8.8.8`
  - Review Focus 1: `the guarded lookup calls back with BlockedUrlError when one of two addresses is 192.168.1.1`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Use `ipaddr.process(ip).range() === "unicast"` (`process` turns an IPv4-mapped address into IPv4). The lookup honors `options.all`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): add the SSRF guard for proxy URLs`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run src/ai/url-guard.test.ts --maxWorkers=1`

### Task 5: The AI client and the error map

**Files:**
- Create: `apps/api/src/ai/ai-client.ts`, `apps/api/src/ai/ai-errors.ts`, `apps/api/test/support/fake-ai-server.ts`
- Modify: `apps/api/package.json` (add `openai` 7.30.0 and `undici` 8.11.2, exact versions)
- Test: `apps/api/test/ai-client.int.test.ts`

**Interfaces:**
- Consumes: `createGuardedLookup`, `BlockedUrlError` (Task 4), `AiErrorCode` (Task 1).
- Produces: `AiTarget = { endpoint: string; apiKey: string; model: string }` and `proxyEndpoint(baseUrl: string, appendPath: boolean): string`.
- Produces: `AiClientFactory { create(target: AiTarget): OpenAI }` with the token `AI_CLIENT_FACTORY`, and `GuardedAiClientFactory`, which calls `assertProxyUrl`, then makes `new OpenAI({ apiKey, baseURL, maxRetries: 0, fetch, fetchOptions: { dispatcher, redirect: "error" } })`. `fetch` is the undici `fetch` wrapped so that it always sends to `target.endpoint`. `dispatcher` is one shared undici `Agent({ connect: { lookup: createGuardedLookup() } })`.
- Produces: `toAiError(error: unknown): AiErrorCode` (the Global Constraints map, plus `BlockedUrlError` → `blocked_url`, and an abort by the reply timer → `timeout`).
- Produces (test support): `startFakeAiServer(): Promise<{ url; close(); next(behavior) }>`, an `http` server on `127.0.0.1` that speaks the OpenAI chat completions format. A behavior is `{ pieces: string[]; delayMs?: number; firstDelayMs?: number }` or `{ status: number; body?: unknown }`. A request with `stream: false` gets one JSON completion with the pieces joined. It records the last request body, the request count, and the `Authorization` header. Also `UnguardedAiClientFactory`, the same factory with the undici default `fetch` and no guard, for e2e tests only.

- [ ] **Step 1:** Write `ai-client.int.test.ts` (with the fake server and `UnguardedAiClientFactory`):
  - `a stream gives the pieces in order, and the request goes to the endpoint with the Bearer key`
  - `toAiError maps 401 to invalid_key, 404 to model_not_found, 402 to no_credit, 429 insufficient_quota to no_credit, 429 to rate_limited, and 500 to provider_error`
  - `toAiError maps a refused connection to provider_unreachable`
  - Review Focus 1: `GuardedAiClientFactory refuses https://127.0.0.1 with blocked_url, and the fake server gets no request`
  - `proxyEndpoint adds /chat/completions only when appendPath is true`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files and run `pnpm install`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): add the guarded AI client and the provider error map`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/ai-client.int.test.ts --maxWorkers=1`

### Task 6: Proxies API and the active proxy in /me

**Files:**
- Create: `apps/api/src/proxies/proxies.module.ts`, `apps/api/src/proxies/proxies.controller.ts`, `apps/api/src/proxies/proxies.service.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/me/me.service.ts`, `apps/api/src/me/me.controller.ts`
- Test: `apps/api/test/proxies.e2e.test.ts`

**Interfaces:**
- Consumes: `proxyCreateSchema`, `ProxyView`, `ProxyTestResult` (Task 1), `KeyCipher` (Task 3), `AI_CLIENT_FACTORY`, `toAiError`, `proxyEndpoint` (Task 5).
- Produces: `GET /proxies` → `ProxyView[]`, `POST /proxies` → 201 `ProxyView`, `PATCH /proxies/:id`, `DELETE /proxies/:id` → 204, `POST /proxies/:id/activate` → `MeResponse`, `POST /proxies/:id/test` → `ProxyTestResult` (the rate limit comes in Task 12). All behind `SessionGuard`, all filtered by the user ID, and a foreign or unknown ID gives 404. The first proxy of a user becomes active.
- Produces: `ProxiesService.loadTarget(user: User): Promise<{ target: AiTarget; customPrompt: string }>`, which throws 409 `{ "error": "no_active_proxy" }`. Tasks 9 to 11 use it.
- Produces: `MeService.toResponse(user: User): Promise<MeResponse>` with `replyChoicesOn` and `activeProxy`. It replaces the sync `toMeResponse` at each call site.

- [ ] **Step 1:** Write `proxies.e2e.test.ts` (with `UnguardedAiClientFactory` and the fake server):
  - `POST /proxies saves a proxy, makes it active, and the answer has keyLast4 "3f9a" and no key field`
  - Review Focus 2: `no answer of GET, POST, PATCH, or Test holds the key text or a ciphertext field`
  - `PATCH with no apiKey keeps the old key, and the next Test sends the old key`
  - `POST /proxies with https://10.0.0.5 gives 400 { error: "blocked_url" }`
  - `the 21st proxy gives 409 proxy_limit`
  - `activate changes activeProxy in GET /me, and delete of the active proxy sets it to null`
  - `Test gives { ok: true, reply: "OK" }, and a 401 from the fake server gives { ok: false, error: "invalid_key" }`
  - Review Focus 3: `another user gets 404 for PATCH, DELETE, activate, and Test`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Make the new row ID with `randomUUID()` before the encrypt, because the AAD holds the proxy ID.
- [ ] **Step 4:** Run the check command. Expected: PASS, 8 tests. Also run `test/me.e2e.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): add the proxies API with Test and the active proxy`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/proxies.e2e.test.ts --maxWorkers=1`

### Task 7: The prompt builder and the context budget

**Files:**
- Create: `apps/api/src/chats/prompt.ts`
- Test: `apps/api/src/chats/prompt.test.ts`

**Interfaces:**
- Produces: `PromptCharacter = { title; chatName; personality; scenario; exampleDialogs }` and `buildReplyPrompt(input: { character: PromptCharacter; customPrompt: string; userName: string; history: Array<{ role: "user" | "assistant"; content: string }> }): ChatCompletionMessageParam[]`.
- Produces: `buildChoicesPrompt(input)` with the same input, which adds the choices instruction as the last `user` message, and `parseChoices(text: string): string[] | null`.
- Produces: `CONTEXT_BUDGET_TOKENS = 16_000`.

- [ ] **Step 1:** Write `prompt.test.ts`:
  - `the system message has the roleplay text, then Instructions, Personality, Scenario, and Example dialogs, and leaves out an empty part`
  - `{{char}} becomes the chat name, or the title when the chat name is empty, and {{user}} becomes the user name, also in history`
  - `old messages drop out when the history is over 16,000 tokens, and the newest message stays`
  - `a newest message of 20,000 tokens still goes in`
  - `parseChoices accepts a fenced JSON array of four strings and trims them`
  - `parseChoices gives null for prose, three items, a number item, an empty string item, and a 301-character item`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the file. Count the tokens with `estimateTokens` from `@wanderer/shared`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests.
- [ ] **Step 5:** Commit: `feat(api): build the roleplay prompt with a context budget`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run src/chats/prompt.test.ts --maxWorkers=1`

### Task 8: Chats API: create, list, read, delete, and message edit and delete

**Files:**
- Create: `apps/api/src/chats/chats.module.ts`, `apps/api/src/chats/chats.controller.ts`, `apps/api/src/chats/chats.service.ts`, `apps/api/src/characters/visibility.ts`
- Modify: `apps/api/src/characters/characters.service.ts` (use `visibility.ts`), `apps/api/src/app.module.ts`
- Test: `apps/api/test/chats.e2e.test.ts`

**Interfaces:**
- Consumes: `createChatSchema`, `ChatSummary`, `ChatDetail`, `MessageView` (Task 1), the tables (Task 2).
- Produces: `characterAccess(row: { creatorId; status; isPublic; isAdult }, viewer: User | null): "ok" | "not_found" | "adult_content"`. `CharactersService.findVisible` and the chats service both use it.
- Produces: `POST /chats` → 201 `ChatDetail` (the chat, message 0 = the chosen opening, `chatCount + 1`, one transaction; an unknown opening index gives 400 `{ "error": "invalid_opening" }`; a character that the user cannot see gives 404 or 403 `adult_content` as on the character page). `GET /chats?characterId=` → `ChatListResponse` (newest `lastMessageAt` first, 20 items or less). `GET /chats/:id` → `ChatDetail`, with `canSend = characterAccess(...) === "ok"`. `DELETE /chats/:id` → 204. `PATCH /messages/:id` (`messageInputSchema`) → `MessageView`. `DELETE /messages/:id` → 204. A foreign or unknown ID gives 404.
- Produces: `ChatsService.loadForReply(chatId: string, user: User): Promise<{ chat; character: PromptCharacter; history: MessageRow[] }>`, which throws 404 when `canSend` is false. Tasks 9 to 11 use it.

- [ ] **Step 1:** Write `chats.e2e.test.ts`:
  - `POST /chats with openingIndex 1 makes a chat whose message 0 is the second opening, and chatCount goes up by one`
  - `POST /chats with openingIndex 5 for a character with 2 openings gives 400 invalid_opening`
  - `POST /chats for a private character of another user gives 404, and for a blocked 18+ character gives 403`
  - `GET /chats lists the newest chat first, and characterId filters the list`
  - `PATCH /messages/:id of a user message sets editedAt, and of the opening gives 404`
  - `DELETE /chats/:id removes the chat, and chatCount does not go down`
  - Review Focus 3: `another user gets 404 for GET, DELETE, and message PATCH and DELETE`
  - `GET /chats/:id gives canSend false after the creator makes the character private`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Make test messages with Prisma directly, because the send endpoint comes in Task 9.
- [ ] **Step 4:** Run the check command. Expected: PASS, 8 tests. Also run `test/characters.e2e.test.ts` and `test/adult.e2e.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): add the chats API and message edit and delete`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/chats.e2e.test.ts --maxWorkers=1`

### Task 9: Streamed replies

**Files:**
- Create: `apps/api/src/chats/sse.ts`, `apps/api/src/chats/reply.service.ts`
- Modify: `apps/api/src/chats/chats.controller.ts`, `apps/api/src/chats/chats.module.ts`
- Test: `apps/api/test/chat-stream.e2e.test.ts`

**Interfaces:**
- Consumes: `loadTarget` (Task 6), `loadForReply` (Task 8), `buildReplyPrompt` (Task 7), `AI_CLIENT_FACTORY`, `toAiError` (Task 5), `ChatStreamEvent` (Task 1).
- Produces: `REPLY_TIMING` token with `{ firstPieceMs: 30_000; totalMs: 180_000; heartbeatMs: 15_000 }`, and `openSse(res: Response, heartbeatMs: number): { send(event: ChatStreamEvent): void; end(): void }`.
- Produces: `ReplyService.stream(input: { user; chatId; res; req; mode: { kind: "send"; content: string } | { kind: "regenerate" } }): Promise<void>`. It checks the chat, the proxy, and the busy set before it sends the SSE headers, so these errors stay JSON. Then it sends `start`, the `delta` events, and `done` or `error`. On `req` `close` before the end, it aborts the proxy call and saves the part that came. It updates `chat.lastMessageAt`, and it always removes the chat from the busy set in `finally`.
- Produces: `POST /chats/:id/messages` (`messageInputSchema`). Task 10 adds Regenerate to the same service.

- [ ] **Step 1:** Write `chat-stream.e2e.test.ts` (fake server, `REPLY_TIMING` = `{ firstPieceMs: 300, totalMs: 1_000, heartbeatMs: 50 }`):
  - `a send gives start with the user message, the deltas in order, and done with the saved reply`
  - `the proxy request has the system prompt, the opening, and the history in order`
  - `a send with no active proxy gives 409 JSON no_active_proxy and saves no message`
  - `a 401 from the proxy gives an error event invalid_key with message null, and the user message stays`
  - `a slow first piece gives an error event timeout`
  - `a slow stream gets ": ping" lines`
  - Review Focus 4: `a client abort after two pieces saves those two pieces as the reply`
  - Review Focus 4: `a second send while a stream runs gives 409 chat_busy, and a send after an error works`
  - Review Focus 3: `another user gets 404 for a send`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Write to the Express `Response` with `@Res()`; do not use the Nest `@Sse()` decorator, because it works only with `GET`. Call `res.flushHeaders()` after the headers.
- [ ] **Step 4:** Run the check command. Expected: PASS, 9 tests.
- [ ] **Step 5:** Commit: `feat(api): stream AI replies as server-sent events`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/chat-stream.e2e.test.ts --maxWorkers=1`

### Task 10: Regenerate

**Files:**
- Modify: `apps/api/src/chats/reply.service.ts`, `apps/api/src/chats/chats.controller.ts`
- Test: `apps/api/test/regenerate.e2e.test.ts`

**Interfaces:**
- Consumes: `ReplyService.stream` (Task 9).
- Produces: `POST /chats/:id/regenerate` with the rules in Global Constraints.

- [ ] **Step 1:** Write `regenerate.e2e.test.ts`:
  - `regenerate replaces the content of the last reply and keeps its ID`
  - `regenerate after a user message with no reply makes a new reply`
  - `regenerate on a chat with only the opening gives 409 nothing_to_regenerate`
  - Review Focus 4: `a regenerate that gets a 500 before the first piece keeps the old reply`
  - Review Focus 4: `a client abort before the first piece keeps the old reply`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Change the files. The new text replaces the old text only when the new text is not empty.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests. Also run `test/chat-stream.e2e.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): add Regenerate`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/regenerate.e2e.test.ts --maxWorkers=1`

### Task 11: Reply choices and the choices setting

**Files:**
- Create: `apps/api/src/chats/choices.service.ts`
- Modify: `apps/api/src/chats/chats.controller.ts`, `apps/api/src/chats/chats.module.ts`, `apps/api/src/me/me.service.ts` (save `replyChoicesOn`)
- Test: `apps/api/test/choices.e2e.test.ts`

**Interfaces:**
- Consumes: `buildChoicesPrompt`, `parseChoices` (Task 7), `loadTarget`, `loadForReply`.
- Produces: `POST /chats/:id/choices` → 200 `ChoicesResponse`, or 502 `{ "error": "choices_failed" }`, or a mapped `AiErrorCode` with 502 when the proxy call fails. It does not store the choices. It does not check `replyChoicesOn`, because the web sends the call only when the switch is on.
- Produces: `PATCH /me { replyChoicesOn }`.

- [ ] **Step 1:** Write `choices.e2e.test.ts`:
  - `a JSON array of four strings gives the four choices`
  - Review Focus 5: `prose, then a fenced array, gives the choices after one more try`
  - Review Focus 5: `three items two times gives 502 choices_failed, and the fake server got two requests`
  - Review Focus 5: `a send after choices_failed still works`
  - `PATCH /me { replyChoicesOn: false } changes GET /me`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(api): add reply choices`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/choices.e2e.test.ts --maxWorkers=1`

### Task 12: Per-user rate limits

**Files:**
- Create: `apps/api/src/security/user-throttler.guard.ts`
- Modify: `apps/api/src/app.module.ts` (the throttler `user`, default limit `Number.MAX_SAFE_INTEGER`), `apps/api/src/security/client-ip-throttler.guard.ts` (skip the throttler `user`), `apps/api/src/chats/chats.controller.ts`, `apps/api/src/proxies/proxies.controller.ts`
- Test: `apps/api/test/rate-limits.e2e.test.ts`

**Interfaces:**
- Produces: `UserThrottlerGuard`, which counts only the throttler `user` and tracks `user:<id>`. Use it as `@UseGuards(SessionGuard, UserThrottlerGuard)` after the session guard, with `@Throttle({ user: { limit, ttl: 60_000 } })`: 30 on send, 30 on Regenerate, 30 on choices, and 10 on proxy Test. Each route has its own count.

- [ ] **Step 1:** Write `rate-limits.e2e.test.ts`:
  - `the 31st send in one minute gives 429, and another user can still send`
  - `the 31st choices call in one minute gives 429`
  - `the 11th proxy Test in one minute gives 429`
  - `two users behind one IP each get their own 30 sends`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the guard. In `ClientIpThrottlerGuard.handleRequest`, return `true` when `throttler.name === "user"`. In `UserThrottlerGuard.handleRequest`, return `true` for every other throttler.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests. Also run `test/auth.e2e.test.ts` (the login limit). Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): add per-user rate limits for chat and proxy calls`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/rate-limits.e2e.test.ts --maxWorkers=1`

### Task 13: For you

**Files:**
- Modify: `apps/api/src/characters/character-list.service.ts`, `apps/api/src/characters/characters.controller.ts`
- Test: `apps/api/test/for-you.e2e.test.ts`

**Interfaces:**
- Produces: `GET /characters/for-you` (`SessionGuard`) → `{ items: CharacterCard[] }`. It takes the 3 tags that occur most on the characters of the user's chats, and gives 12 or less visible characters with one of these tags (the Discover visibility and 18+ filter), not made by the user and with no chat of the user, most chats first. No chats gives an empty list. Declare the route before `GET /characters/:id`.

- [ ] **Step 1:** Write `for-you.e2e.test.ts`:
  - `a user with two horror chats gets horror characters that they have not chatted with`
  - `a user with no chats gets an empty list`
  - `the list has no private, draft, own, or blocked 18+ character`
  - `a visitor gets 401`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Change the files. Reuse the visibility `where` of `discover`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests. Also run `test/discover.e2e.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): add the For you list`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/api exec vitest run test/for-you.e2e.test.ts --maxWorkers=1`

### Task 14: Models settings page

**Files:**
- Create: `apps/web/src/app/(shell)/settings/models/page.tsx`, `apps/web/src/components/proxy-form.tsx`, `apps/web/src/components/proxy-list.tsx`
- Test: `apps/web/src/components/proxy-form.test.tsx`

**Interfaces:**
- Consumes: the proxies API (Task 6), `apiFetch`, `useRequireLogin`.
- Produces: the page `/settings/models` with the proxy list (name, model, `••••<last4>`, an "Active" badge, Use, Edit, Test, Delete with a confirm step on the page) and the form (Name, Proxy URL, an "Add /chat/completions" checkbox with the full endpoint under it, API key with Show or Hide, Model, Custom prompt). On edit, the key field is empty with the placeholder `••••<last4> (leave empty to keep)`. After each change, the page invalidates the `["proxies"]` and `["me"]` queries, so the sidebar card changes at once. The Test result shows under the row: the reply and the time, or the `AI_ERROR_TEXT` of the code.

- [ ] **Step 1:** Write `proxy-form.test.tsx`:
  - `the endpoint line shows /chat/completions only when the checkbox is on`
  - `Show changes the key field type from password to text`
  - `a submit on edit with an empty key sends no apiKey field`
  - `a blocked_url answer shows "This proxy URL is not allowed." at the URL field`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. Follow the form style of `character-form`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests.
- [ ] **Step 5:** Commit: `feat(web): add the models settings page`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/components/proxy-form.test.tsx --maxWorkers=1`

### Task 15: Sidebar: For you, Recent chats, and the model card

**Files:**
- Create: `apps/web/src/components/recent-chats.tsx`, `apps/web/src/components/model-card.tsx`
- Modify: `apps/web/src/components/sidebar-nav.tsx`, `apps/web/src/components/app-shell.tsx`
- Test: `apps/web/src/components/sidebar.test.tsx` (add cases)

**Interfaces:**
- Consumes: `GET /chats` (`["chats"]` query), `me.activeProxy`.
- Produces: the nav link "For you" (`/#for-you`) for a logged-in user. "Recent" lists the 8 newest chats (avatar, title, link to `/chats/<id>`) and is hidden when empty. The model card shows the name and the model of the active proxy with a link to `/settings/models`, or "Add a model" when there is none. A visitor sees none of these.

- [ ] **Step 1:** Add to `sidebar.test.tsx`:
  - `Recent lists the chats with links to /chats/<id>`
  - `the model card shows the active proxy name and model`
  - `the model card shows "Add a model" when activeProxy is null`
  - `a visitor sees no For you, no Recent, and no model card`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files.
- [ ] **Step 4:** Run the check command. Expected: PASS, the old tests and 4 new tests.
- [ ] **Step 5:** Commit: `feat(web): add Recent chats and the model card to the sidebar`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/components/sidebar.test.tsx --maxWorkers=1`

### Task 16: Character page: Start a new chat and Your chats

**Files:**
- Create: `apps/web/src/app/(shell)/characters/[id]/start-chat.tsx`, `apps/web/src/app/(shell)/characters/[id]/your-chats.tsx`
- Modify: `apps/web/src/app/(shell)/characters/[id]/character-view.tsx` (the openings section becomes "How the story starts" with one radio for each opening)
- Test: `apps/web/src/app/(shell)/characters/[id]/start-chat.test.tsx`

**Interfaces:**
- Consumes: `POST /chats`, `GET /chats?characterId=`, `DELETE /chats/:id`.
- Produces: "Start a new chat" sends the chosen opening index, then goes to `/chats/<id>` and invalidates `["chats"]`. A visitor gets the button "Log in to chat", which links to `/login`. "Your chats" lists this user's chats with this character (last line, time, Open, Delete with a confirm step on the page) and is hidden when empty.

- [ ] **Step 1:** Write `start-chat.test.tsx`:
  - `the first opening is chosen at first, and a click on Start sends openingIndex 0`
  - `a click on the third opening, then Start, sends openingIndex 2 and goes to /chats/<id>`
  - `a visitor sees "Log in to chat"`
  - `Your chats lists the chats, and Delete asks for a confirm before the DELETE`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files.
- [ ] **Step 4:** Run the check command. Expected: PASS, 4 tests. Also run `character-view.test.tsx`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(web): start a chat from an opening on the character page`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/characters/[id]/start-chat.test.tsx" --maxWorkers=1`

### Task 17: The stream reader

**Files:**
- Create: `apps/web/src/lib/chat-stream.ts`
- Test: `apps/web/src/lib/chat-stream.test.ts`

**Interfaces:**
- Consumes: `ChatStreamEvent` (Task 1).
- Produces: `streamChat(path: string, body: unknown, options: { signal: AbortSignal; onEvent(event: ChatStreamEvent): void }): Promise<void>`. It posts with `credentials: "include"` and the JSON body, throws `ApiError` for a JSON answer that is not 2xx, reads `res.body` with a `TextDecoder`, splits on blank lines, skips comment lines (`:`), and parses each `data:` line. A piece that splits an event in two works. An abort ends the read with no error.

- [ ] **Step 1:** Write `chat-stream.test.ts` (with a mock `fetch` that gives a `ReadableStream`):
  - `it gives start, two deltas, and done in order`
  - `it joins an event that comes in two pieces, and a UTF-8 character split between two pieces`
  - `it skips ": ping" lines`
  - `a 409 JSON answer throws ApiError with the code chat_busy`
  - `an abort ends with no error`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the file.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests.
- [ ] **Step 5:** Commit: `feat(web): read the reply stream`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run src/lib/chat-stream.test.ts --maxWorkers=1`

### Task 18: The chat page

**Files:**
- Create: `apps/web/src/app/(shell)/chats/[id]/page.tsx`, `apps/web/src/app/(shell)/chats/[id]/chat-view.tsx`, `apps/web/src/app/(shell)/chats/[id]/message-item.tsx`, `apps/web/src/app/(shell)/chats/[id]/composer.tsx`
- Test: `apps/web/src/app/(shell)/chats/[id]/chat-view.test.tsx`

**Interfaces:**
- Consumes: `GET /chats/:id` (`["chat", id]` query), `streamChat` (Task 17), `PATCH` and `DELETE /messages/:id`, `Markdown`.
- Produces: the prototype chat layout: the character profile at the top, round avatars, grey bubbles for the user, the `Markdown` component for each message (so `*text*` shows in italics), and a `column-reverse` scroll box. The AI reply grows as `delta` events come. Send changes to Stop during a stream; Stop aborts the fetch. Edit (in place, Save and Cancel) and Delete (confirm) on user messages, Regenerate on the last reply. An `error` event shows its `AI_ERROR_TEXT` under the last message. `canSend: false` shows "This character is no longer available." in place of the text box. `me.activeProxy === null` shows the text box with a link "Add a model" to `/settings/models`. The text box is always there; Enter sends and Shift+Enter makes a new line.
- Produces: `Composer` props `{ disabled: boolean; streaming: boolean; onSend(text: string): void; onStop(): void; toolbar?: ReactNode }`. Task 19 puts the choices switch in `toolbar`.

- [ ] **Step 1:** Write `chat-view.test.tsx` (mock `streamChat` and `apiFetch`):
  - `the messages show in order, and *waves* shows as an em element`
  - `a send shows the user message, then the reply grows with each delta`
  - `Stop calls abort on the signal`
  - `an error event invalid_key shows "The proxy refused the API key."`
  - `Edit, then Save, sends PATCH with the new text, and an assistant message has no Edit`
  - `canSend false shows "This character is no longer available." and no text box`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the files. After `done`, write the saved messages into the `["chat", id]` cache, and invalidate `["chats"]`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 6 tests.
- [ ] **Step 5:** Commit: `feat(web): add the chat page with streamed replies`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/chats/[id]/chat-view.test.tsx" --maxWorkers=1`

### Task 19: Reply choices in the chat page

**Files:**
- Create: `apps/web/src/app/(shell)/chats/[id]/reply-choices.tsx`
- Modify: `apps/web/src/app/(shell)/chats/[id]/chat-view.tsx`
- Test: `apps/web/src/app/(shell)/chats/[id]/reply-choices.test.tsx`

**Interfaces:**
- Consumes: `POST /chats/:id/choices`, `PATCH /me { replyChoicesOn }`, `Composer.toolbar` (Task 18).
- Produces: when `me.replyChoicesOn` is true, after each `done` the page asks for choices and shows four pills above the text box; a click sends that text at once; "New choices" asks again. Any error hides the pills with no message. The "Reply choices" switch (`role="switch"`) in the composer toolbar saves the setting with `PATCH /me` and hides the pills at once when it goes off. A new send hides the old pills.

- [ ] **Step 1:** Write `reply-choices.test.tsx`:
  - `after done, four choices show, and a click on one sends its text`
  - `"New choices" asks again and shows the new set`
  - `a 502 answer shows no choices and no error text`
  - `the switch off sends PATCH /me { replyChoicesOn: false } and hides the choices`
  - `with replyChoicesOn false, done asks for no choices`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the file and change `chat-view.tsx`.
- [ ] **Step 4:** Run the check command. Expected: PASS, 5 tests. Also run `chat-view.test.tsx`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(web): show reply choices above the text box`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/chats/[id]/reply-choices.test.tsx" --maxWorkers=1`

### Task 20: Home: Welcome back, Continue your chat, and For you

**Files:**
- Create: `apps/web/src/components/continue-banner.tsx`
- Modify: `apps/web/src/app/(shell)/discover-view.tsx`
- Test: `apps/web/src/app/(shell)/discover-view.test.tsx` (add cases)

**Interfaces:**
- Consumes: `GET /chats` (the first item), `GET /characters/for-you` (Task 13), `CharacterCard`.
- Produces: for a logged-in user, "Welcome back, {name}", the "Continue your chat" banner (the character avatar, the title, `lastMessage`, a link to `/chats/<id>`), and the "For you" row (`id="for-you"`) above Popular stories. Each part is hidden when its list is empty. A visitor sees none of them.

- [ ] **Step 1:** Add to `discover-view.test.tsx`:
  - `a user with chats sees "Welcome back, Robin" and a banner with the last line that links to the chat`
  - `the For you row shows the cards from /characters/for-you`
  - `a user with no chats sees no banner and no For you row`
  - `a visitor sees no greeting, no banner, and no For you row`
- [ ] **Step 2:** Run the check command. Expected: FAIL.
- [ ] **Step 3:** Add the file and change the view.
- [ ] **Step 4:** Run the check command. Expected: PASS, the old tests and 4 new tests.
- [ ] **Step 5:** Commit: `feat(web): add Welcome back, Continue your chat, and For you`.

**Check:** `NODE_OPTIONS=--max-old-space-size=1024 pnpm --filter @wanderer/web exec vitest run "src/app/(shell)/discover-view.test.tsx" --maxWorkers=1`

### Task 21: Deploy notes and the full gate

**Files:**
- Modify: `docs/deploy.md` (add `KEY_ENCRYPTION_KEY` to the api variables, with the command `openssl rand -base64 32`), `apps/api/prisma/seed-dev.ts` (optional: one chat for the dev user, so Recent is not empty)

- [ ] **Step 1:** Write a caution in `docs/deploy.md` before the variable step: "If you lose or change `KEY_ENCRYPTION_KEY`, no saved API key decrypts, and each user must enter their keys again."
- [ ] **Step 2:** Run the full gate one time: `/do-tests full` (lint, typecheck, test, build; one at a time, Turbo `--concurrency=1`, `--max-old-space-size=2048` for typecheck and build). Expected: all PASS.
- [ ] **Step 3:** Start the API and the web app, add a real proxy, and chat with Onnit in the browser: a streamed reply, Stop, Regenerate, an edit, and four choices. Take screenshots with `/do-screenshots`.
- [ ] **Step 4:** Commit: `docs: add KEY_ENCRYPTION_KEY to the deploy notes`.

**Check:** `/do-tests full`
