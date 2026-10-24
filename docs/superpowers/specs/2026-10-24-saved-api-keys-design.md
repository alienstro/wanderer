# Design: saved API keys (issue #34)

## Intent

Today each model (a `proxies` row) holds its own API key. A user with 5 models on one proxy pastes the
same key 5 times. When the key changes, the user must edit each model. The user wants "a CRUD of secrets",
so that the user enters a key one time and picks it in each model.

## Goals

- The user adds, renames, replaces and deletes saved API keys.
- The model form picks a saved key. It also has an "Add a new key" choice.
- A replace of a saved key changes the key for each model that uses it.
- Each existing model keeps its key after the deploy, with no new entry.

## Non-goals

- A share of keys between users.
- A view of the full key after the save.
- The model list from the proxy.
- A join of equal keys into one saved key during the move.

## Anti-goals

- A key in two places. Each key has one row only.
- A full key in an API answer or in a log line.
- A model that uses a key of a different user.

## Data

New Prisma model `ApiKey`, table `api_keys`:

| Column | Type | Note |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | uuid | FK to `users`, `ON DELETE CASCADE`, indexed |
| `name` | text | 1 to 60 characters |
| `key_ciphertext`, `key_iv`, `key_tag` | bytea | AES-256-GCM, as today |
| `key_version` | int | the cipher scheme, see below |
| `key_last4` | text | the last 4 characters |
| `created_at`, `updated_at` | timestamptz | |

`proxies` gets `api_key_id uuid NOT NULL`, FK to `api_keys`, `ON DELETE NO ACTION`, indexed. NO ACTION checks at the end of the statement, so a user delete can cascade in any order.
The migration removes the 5 key columns from `proxies`.

## The cipher

The `KeyCipher` binds each key to a row id through the AAD. The version tells the AAD form:

- Version 1: the AAD is `proxy:<id>`. Only moved keys use it.
- Version 2: the AAD is `api_key:<id>`. Each new encrypt uses it.

`encrypt(plain, apiKeyId)` always gives version 2. `decrypt(sealed, apiKeyId)` picks the AAD from the version.
An unknown version still throws `KeyDecryptError`.

## The move of existing keys

One Prisma migration, in plain SQL, in one transaction (`BEGIN` / `COMMIT` in the file):

1. Create `api_keys`.
2. Copy each proxy into `api_keys` with the **same id**, the same `user_id`, the proxy name as the key
   name, and the 5 key columns as they are (version 1).
3. Add `proxies.api_key_id`, set it to `proxies.id`, then set `NOT NULL`, the FK and the index.
4. Drop the 5 key columns from `proxies`.

The AAD of a moved key is `proxy:<id>`, and the id of the saved key is that same id. So the old ciphertext
still decrypts, with no decrypt script. A later Replace of the key writes version 2.

My call. The issue proposed a decrypt script and a later migration that drops the columns. The SQL copy gives
the same result in one deploy, and a failure rolls back all of it.

Caution: the common practice for zero downtime is "expand, then contract" over two deploys. This design uses
one deploy. During the rolling update, the old container cannot read the key, and a chat call fails for some
seconds. This is acceptable for the current user count.

## Shared contract (`packages/shared/src/api-keys.ts`)

- `API_KEY_LIMIT = 20`, `API_KEY_NAME_MAX = 60`, `API_KEY_MAX = 500` (the old `PROXY_KEY_MAX` moves here).
- `apiKeyCreateSchema`: `name`, `apiKey`, both required.
- `apiKeyUpdateSchema`: `name` and `apiKey`, both optional. The body must have one of them.
- `ApiKeyView`: `id`, `name`, `keyLast4`, `modelCount`, `createdAt`.

Changes in `packages/shared/src/proxies.ts`:

- `proxyCreateSchema`: `apiKeyId` (a uuid) replaces `apiKey`.
- `proxyUpdateSchema`: `apiKeyId` is optional. The `apiKey` field goes away.
- `ProxyView`: `savedKey: { id, name, keyLast4 }` replaces `keyLast4`. The name is not `apiKey`, because `apiKey` is the raw key in the create schemas.

## API

New Nest module `apps/api/src/api-keys/`. It owns the `KEY_CIPHER` provider and exports `ApiKeysService`.
`ProxiesModule` imports it.

| Route | Result |
|---|---|
| `GET /api-keys` | the keys of the user, oldest first, as `ApiKeyView[]` |
| `POST /api-keys` | `201` and the view. `409 { error: "api_key_limit" }` at 20 keys |
| `PATCH /api-keys/:id` | a new name, a new key, or both. `200` and the view |
| `DELETE /api-keys/:id` | `204`. `409 { error: "api_key_in_use", models: [names] }` when a model uses it |

- A bad body gives `400 { error: "invalid_api_key", fields }`, as the proxy routes do.
- Each route finds the key by `id` and `userId`. A key of a different user, or a bad uuid, gives
  `404 { error: "not_found" }`, and the API changes nothing.
- No answer has the key. No log line has the key.

Changes in `ProxiesService`:

- Create and update check that `apiKeyId` belongs to the user. Else `404 { error: "not_found" }`.
- `list`, `test` and `loadTarget` load the proxy with its `apiKey` row and decrypt with the key id.
- The proxy service no longer encrypts.

## Web

- The Models page (`/settings/models`) gets an "API keys" section above the model list. The page text changes
  to say that Wanderer keeps each key encrypted.
- New component `api-keys-section.tsx`: the list (name, `••••` plus the last 4 characters, the model count),
  an "Add a key" form (name and key), and on each row Rename, Replace and Delete.
- A Delete that gets `409 api_key_in_use` shows "Change these models first: A, B." The key stays.
- A `409 api_key_limit` shows "You can save 20 API keys. Delete a key to add a new one."
- `proxy-form.tsx`: a select of the saved keys replaces the API key field. The last option is "Add a new
  key". That option shows a name field and a key field. On save, the form first calls `POST /api-keys`,
  then saves the model with the new id. If the second call fails, the new key stays in the list.
- `proxy-list.tsx` shows the key name and `••••` plus the last 4 characters.
- A save of a key or a model loads `["api-keys"]` and `["proxies"]` again.

## Tests

- `key-cipher.test.ts`: version 1 decrypts with the old AAD, version 2 binds to the key id.
- New `apps/api/test/api-keys.e2e.test.ts`: each item of "Done when" in the issue that the API owns.
- `proxies.e2e.test.ts` and the test helpers create a saved key first.
- `api-keys-section.test.tsx` and `proxy-form.test.tsx` for the web.
- One manual check of the migration: a version 1 proxy row before the migration still decrypts after it.

## Left to the builder

- The exact layout and copy of the section, within the current visual system.
- The names of private helpers.
