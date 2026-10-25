# User personas (issue #66)

## Intent

The prompt knows only the account name of the user. To tell the character who they are, a user
writes it in the first messages of each chat. The character forgets it when the old messages leave
the context. A user who plays different roles must type the facts again for each new chat.

This design adds personas. A user saves up to 3 personas in Settings. Each new chat takes a copy
of the default persona. The character knows the name and the facts of the user from the first
reply to the last.

## Goals

- A user saves up to 3 personas. A persona has a name and an optional description.
- A new chat uses the default persona. The reply, the reply choices, the memory and the scene
  image all use the persona of the chat.
- The persona of a chat never changes. An edit or a delete of a persona does not change old chats.
- The chat page shows which persona the user plays.
- A user with no persona keeps the current behaviour: `{{user}}` is the account name.

## Non-goals

- A picture for each persona.
- More than 3 personas, or a paid limit.
- Personas that other users can see or copy.
- A persona picker when the user starts a chat. The chat always takes the default.
- A change of the persona of a chat after the chat starts.

## Anti-goals

- An edit of a persona silently changes the past of an old chat.
- A race, such as two tabs or two quick clicks, makes a 4th persona or two default personas.
- A user reads, edits or uses the persona of another user.

## Decisions (from the user)

1. The persona of a chat does not change. To play as a different persona, the user starts a new chat.
2. A new chat always takes the default persona. The new-chat flow shows no picker.
3. A user with one or more personas always has a default persona. The user cannot clear the default.
4. Settings shows a short list of personas. "Add persona" and "Edit" open a dialog (mockup option B).
5. The chat page shows "· You play as Aria" in the header, next to "Character page" (mockup option A).

## Design

### Data

New table `personas`. The `personas` module owns it.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key. |
| `user_id` | `uuid` | References `users.id` with `ON DELETE CASCADE`. |
| `name` | `text` | 1 to 50 characters, trimmed. |
| `description` | `text` | 0 to 1,000 characters, trimmed. Default `""`. |
| `is_default` | `boolean` | Default `false`. |
| `created_at`, `updated_at` | `timestamptz` | |

- An index on `user_id`.
- A partial unique index, so a user has no more than one default:
  `@@unique([userId], map: "personas_one_default_key", where: raw("is_default"))`.
  The schema already turns on the `partialIndexes` preview feature, and `FreeModel` uses the same
  pattern (`free_models_one_default_key`).

New columns on `chats`. The `chats` module owns them.

| Column | Type | Notes |
|---|---|---|
| `persona_name` | `text`, nullable | A copy of the persona name when the chat starts. Null when the user had no persona. |
| `persona_description` | `text`, nullable | A copy of the persona description. Null when `persona_name` is null. |

The chat keeps a copy (a snapshot), not a `persona_id`. A link to the live persona breaks
decision 1: an edit of the persona changes the text of each old chat. With a copy, decision 1 is
true by design, the prompt build reads no extra row, and a persona delete changes no chat.
Old chats get null in both columns and keep the current behaviour.

### Shared (`packages/shared/src/personas/`)

- `PERSONA_LIMIT = 3`, `PERSONA_NAME_MAX = 50`, `PERSONA_DESCRIPTION_MAX = 1000`.
- `personaInputSchema`: zod object with `name` (trimmed, 1 to `PERSONA_NAME_MAX`) and
  `description` (trimmed, 0 to `PERSONA_DESCRIPTION_MAX`, default `""`).
- `Persona` type: `id`, `name`, `description`, `isDefault`, `createdAt`, `updatedAt`.
- `PersonaListResponse`: `{ personas: Persona[] }`, oldest first.
- Error codes: `invalid_persona`, `persona_limit`, `not_found`.
- `ChatDetail` (in `packages/shared/src/chats/`) gets `personaName: string | null`. The web does
  not need the description.

### API (`apps/api/src/personas/`)

All routes use the `SessionGuard`. The controller checks the body with the shared schema and calls
the service.

| Route | Result |
|---|---|
| `GET /personas` | `PersonaListResponse` of the current user. |
| `POST /personas` | Creates a persona. Returns the `Persona`. |
| `PATCH /personas/:id` | Changes the name and the description. Returns the `Persona`. |
| `POST /personas/:id/default` | Makes this persona the default. Returns the `PersonaListResponse`. |
| `DELETE /personas/:id` | Deletes the persona. Returns `204`. |

Rules in the service:

- **The limit.** `POST` runs in one transaction. It locks the user row with
  `SELECT id FROM users WHERE id = $1 FOR UPDATE`, counts the personas, and inserts. At
  `PERSONA_LIMIT` personas it throws `409 { error: "persona_limit" }`. `energy.service.ts:167`
  uses the same lock. The lock only reads the `users` row, so the table owner rule still holds.
- **The first default.** When the count is 0, the new persona gets `is_default = true`.
- **Make default.** One transaction sets `is_default = false` on the old default, then `true` on
  the new one. The partial unique index stops a second default if a bug skips the first step.
- **Delete.** One transaction with the same user lock. It deletes the persona. If the persona was
  the default, the oldest other persona (by `created_at`) becomes the default.
- **Ownership.** Each query filters by `id` and `user_id`. A persona of another user gives
  `404 { error: "not_found" }`, so the API does not tell that the id exists.

### Chats (`apps/api/src/chats/`)

- `ChatsService.create()` reads the default persona of the user in its transaction, and copies
  `name` and `description` into `persona_name` and `persona_description`.
- `toChatDetail()` returns `personaName`.
- A chat-module helper gives the prompt values: `userName = chat.personaName ?? user.name` and
  `userDescription = chat.personaDescription ?? ""`. `reply.service.ts`, `choices.service.ts`,
  `memory.service.ts` and `scenes/scenes.service.ts` use the helper in place of `user.name`.
- `prompt.ts`: `PromptInput` gets `userDescription`. `systemText()` adds a `User` section after
  `Scenario`. The section has the form `{{user}}: <description>`, so the model knows whose facts
  they are. An empty description adds no section. `fill()` already replaces `{{user}}` and
  `{{char}}` in each section.

### Web

- `apps/web/src/features/personas/`: the fetch calls, the hooks, `personas-section.tsx` and
  `persona-dialog.tsx`. Export the section from `index.ts`.
- `settings-view.tsx` shows the "Personas" section below "Profile".
- The section shows "Personas (2 of 3)" and one row for each persona: the name, a "Default" badge,
  and the buttons "Make default" (not on the default), "Edit" and "Delete".
- "Add persona" is disabled at `PERSONA_LIMIT`, with the text "You can save up to 3 personas."
  A `persona_limit` error from the API shows the same text.
- The dialog has the name field, the description field and a counter such as "0 / 1,000".
- The dialog uses the native `<dialog>` element with `showModal()`. It gives the focus trap, the
  Esc key and the backdrop.
- "Delete" asks for a confirmation in the same dialog style. The text says that old chats keep the persona.
- `chat-view.tsx`: when `personaName` is not null, the header shows "· You play as **Aria**" after
  "Character page". The text is not a link and not a picker.

### Docs and lint

- `docs/architecture.md`: add `personas` → `personas` and `chats.persona_name`,
  `chats.persona_description` → `chats` to the table owners.
- `apps/api/table-owners.mjs`: add the same owners.

## Tests

- `packages/shared`: `personaInputSchema` trims, and rejects an empty name and a long description.
- `apps/api/src/chats/prompt.test.ts`: the persona name fills `{{user}}`. The `User` section
  shows only with a description.
- `apps/api/test/personas/`: create, list, edit, make default, delete. The 4th persona gives `409`.
  Two `POST` requests at the same time with 2 saved personas make 3 personas, not 4. The first
  persona is the default. A delete of the default promotes the oldest other persona. A persona of
  another user gives `404` on `PATCH`, `POST .../default` and `DELETE`.
- `apps/api/test/chats/`: a new chat copies the default persona. An edit and a delete of the
  persona do not change the chat. A user with no persona gets `personaName: null`.
- `apps/web`: the personas section disables "Add persona" at 3 and shows the API error. The chat
  header shows the persona line only when `personaName` is set.

## Done when

- [ ] A user creates 3 personas in Settings and sees all 3.
- [ ] A 4th persona fails with a clear message, in the web and on the API.
- [ ] Two quick requests at the same time do not make a 4th persona.
- [ ] The first persona becomes the default. A user can make another persona the default.
- [ ] A new chat uses the default persona. The first reply uses the persona name.
- [ ] The reply choices, the memory and the scene image use the persona name for `{{user}}`.
- [ ] The chat header shows "You play as <name>".
- [ ] A user edits or deletes a persona. Old chats keep the old name and description.
- [ ] A user with no persona sees the current behaviour.
- [ ] A user cannot read, edit or use the persona of another user.

## Calls I made (check these)

1. A chat keeps a copy of the persona, not a link. This replaces the issue line "set `personaId` to
   null on its chats". A deleted persona stays in its old chats.
2. The first persona becomes the default. A delete of the default promotes the oldest other persona.
3. Limits: name 1 to 50 characters, description up to 1,000 characters.
4. The `User` section goes after `Scenario` in the prompt.
5. Make default is its own route, `POST /personas/:id/default`, not a field in `PATCH`.
6. The persona dialog uses the native `<dialog>`. The 3 old hand-made dialogs stay as they are.
   A shared `components/ui/dialog.tsx` is a separate task.
7. The user messages in the chat keep the account picture. A persona has no picture (a non-goal).
