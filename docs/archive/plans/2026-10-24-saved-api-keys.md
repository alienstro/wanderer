# Plan: saved API keys (issue #34)

> **For agentic workers:** Use superpowers:executing-plans to do this plan task by task.

Design: `docs/superpowers/specs/2026-10-24-saved-api-keys-design.md`.

**Goal:** The user saves each API key one time and picks it in each model.

**Architecture:** A new `api_keys` table holds each encrypted key. Each proxy points to one key. One SQL
migration copies each proxy key into `api_keys` with the same id, so the old ciphertext still decrypts.

## Global constraints

- `API_KEY_LIMIT = 20`, `API_KEY_NAME_MAX = 60`, `API_KEY_MAX = 500`.
- No API answer and no log line has a full key.
- A key of a different user gives `404 { error: "not_found" }`, and the API changes nothing.
- Each test run: 1 file, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=1024`.
- No commit until the user asks.

## Review focus

- A key name of only spaces: the schema trims it and gives `400`. Test in Task 3.
- `PATCH /api-keys/:id` with an empty body: `400`. Test in Task 3.
- A delete of a key while a model is saved with it at the same time: the FK (`NO ACTION`) stops the delete.
  The service maps Prisma `P2003` to `409 api_key_in_use`. Test in Task 3 (a key in use).
- A proxy update that sends the `apiKeyId` of a different user: `404`, and the proxy keeps its key. Test in Task 4.
- A delete of a user: the cascade deletes the proxies and the keys, with no FK error. Test in Task 4
  (`delete-account.e2e.test.ts`).

---

## Task 1: Cipher versions

- Goal: move `key-cipher.ts` to `apps/api/src/api-keys/`. Version 1 uses the AAD `proxy:<id>`. Version 2
  uses `api_key:<id>`. `encrypt(plain, apiKeyId)` gives version 2. `decrypt` picks the AAD from the version.
- Files: `apps/api/src/api-keys/key-cipher.ts`, `apps/api/src/api-keys/key-cipher.test.ts` (both moved).
- Tests: "encrypt gives version 2", "version 2 does not decrypt with another key id",
  "version 1 decrypts with the proxy AAD of the same id", "an unknown version throws KeyDecryptError".
- Check: `pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 src/api-keys/key-cipher.test.ts`

## Task 2: Data and shared contract

- Goal: the `ApiKey` model, `Proxy.apiKeyId` with `onDelete: Restrict`, the migration of the design, the new
  `packages/shared/src/api-keys.ts`, and the changes in `proxies.ts` (`apiKeyId`, `ProxyView.savedKey`).
- Files: `apps/api/prisma/schema.prisma`, new `apps/api/prisma/migrations/20261024140000_api_keys/migration.sql`,
  new `packages/shared/src/api-keys.ts`, `packages/shared/src/proxies.ts`, `packages/shared/src/index.ts`.
- Tests: none new (the types and the migration only).
- Check: `pnpm --filter @wanderer/api exec prisma validate`, then `pnpm --filter @wanderer/shared typecheck`.

## Task 3: The `/api-keys` routes

- Goal: `ApiKeysModule` (owns `KEY_CIPHER`, exports `ApiKeysService`), the controller, and the service with
  `list`, `create`, `update`, `remove`, `findOwn(user, id)` and `decrypt(row)`.
- Files: new `apps/api/src/api-keys/api-keys.module.ts`, `api-keys.controller.ts`, `api-keys.service.ts`,
  `apps/api/src/app.module.ts`, new `apps/api/test/api-keys.e2e.test.ts`.
- Tests: "POST saves a key and the answer has keyLast4 and no key", "GET lists only own keys with modelCount",
  "400 for a blank name", "400 for an empty PATCH", "PATCH renames", "PATCH replaces the key and keyLast4",
  "the 21st key gives 409 api_key_limit", "DELETE of a key in use gives 409 with the model names",
  "DELETE of a free key gives 204", "a key of another user gives 404 on PATCH and DELETE and changes nothing".
- Check: `pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 test/api-keys.e2e.test.ts`

## Task 4: Proxies use a saved key

- Goal: create and update take `apiKeyId` and check the owner. `list`, `test` and `loadTarget` include the key
  row and decrypt through `ApiKeysService`. The proxy service no longer encrypts.
- Files: `apps/api/src/proxies/proxies.service.ts`, `proxies.module.ts`, `apps/api/test/proxies.e2e.test.ts`,
  `apps/api/test/support/chat-stream.ts`, `apps/api/test/delete-account.e2e.test.ts`.
- Tests: update the current proxy tests to create a key first. Add "two models share one key",
  "a replace of the key changes the key that each model sends to the proxy",
  "create with the key of another user gives 404", "update with the key of another user gives 404".
- Check: `pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 test/proxies.e2e.test.ts`, then the same
  for `test/delete-account.e2e.test.ts` and `test/chat-stream.e2e.test.ts`.

## Task 5: Manual check of the migration

- Goal: prove that a version 1 proxy key still decrypts after the migration.
- Steps: on a scratch database, apply the migrations before `20261024140000_api_keys`. Insert a proxy with a
  version 1 key. Apply the last migration. Decrypt the `api_keys` row with the new cipher.
- Files: a script in the scratchpad only.
- Check: the script prints the original key.

## Task 6: Web "API keys" section

- Goal: the section of the design on `/settings/models`: the list, Add, Rename, Replace and Delete, and the
  `409` messages.
- Files: new `apps/web/src/components/api-keys-section.tsx`, new `api-keys-section.test.tsx`,
  `apps/web/src/app/(shell)/settings/models/page.tsx`.
- Tests: "shows the name and the last 4", "add sends the name and the key", "rename sends only the name",
  "delete of a key in use shows the model names", "the limit shows the limit message".
- Check: `pnpm --filter @wanderer/web exec vitest run --maxWorkers=1 api-keys-section.test.tsx`

## Task 7: Web model form picks a key

- Goal: a key select with "Add a new key". A new key is saved first with `POST /api-keys`, then the model.
  The model list shows the key name and the last 4.
- Files: `apps/web/src/components/proxy-form.tsx`, `proxy-form.test.tsx`, `proxy-list.tsx`.
- Tests: "picks a saved key and sends apiKeyId", "add a new key posts the key and then the model",
  "a new key needs a name and a key", "edit keeps the current key".
- Check: `pnpm --filter @wanderer/web exec vitest run --maxWorkers=1 proxy-form.test.tsx`

## Final gate

- Run lint, typecheck, test and build one time, with `--workspace-concurrency=1`.
