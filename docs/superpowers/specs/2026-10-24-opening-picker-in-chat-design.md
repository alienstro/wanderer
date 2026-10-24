# The opening picker moves into the chat (issue #29)

## Intent

The character page shows each opening in full as a radio card. A character can have
10 openings of up to 4,000 characters each, so the page gets very long. The user also
picks an opening before they read it in the chat.

This design moves the choice into the chat. The user starts a chat with one click.
In the chat, the user moves between the openings with `<` and `>` arrows. The opening
on screen when the user sends the first message stays as the opening of the chat.
The reference is JanitorAI (screenshots in issue #29).

## Goals

- The character page shows no opening text.
- The character page has "Start a new chat" and, when the user has a chat with the
  character, "Continue latest chat".
- A new chat starts with opening 1.
- While the chat has only its opening, the chat shows `<`, `>` and a `1 / N` counter.
- After the first user message, the arrows and the counter go away. The opening stays fixed.
- The server refuses a change of the opening after the chat has a second message.
- A reload shows the opening that the user picked last.

## Non-goals

- Swipes or variants for the replies of the character after the opening.
- Changes to the openings editor of the character form.
- The "Playing as" persona picker of JanitorAI.

## Anti-goals

- A page-only check of the "no change after the first message" rule. Two tabs can send at the same time.
- A copy of all openings into each chat. It saves up to 40,000 characters that the user never uses.

## Decisions (from the user)

- The character page shows no opening text and no preview.
- "Continue latest chat" is in this work.
- The chat page follows the JanitorAI layout: the counter under the opening, `<` on the
  left, `>` on the right. At opening 1, only `>` shows. At the last opening, only `<` shows.

## Design

### Data

- `Chat` gets a new column `openingIndex Int @default(0) @map("opening_index")`.
- The migration fills the column for old chats. It matches the text of message 0 to the
  text of an opening of the character. An old chat with no match keeps `0`.
- `CharacterOpening.position` is the index. `openingIndex` points to that position.

### Shared (`packages/shared/src/chats.ts`)

- `createChatSchema.openingIndex` becomes optional, with the default `0`. An old page that
  still sends it keeps working.
- A new `openingInputSchema = z.object({ openingIndex: z.number().int().min(0).max(OPENINGS_MAX - 1) })`.
- `ChatDetail` gets `opening: { index: number; count: number }`.
  - `count` is the number of openings that the character has now.
  - `index` is `openingIndex`, clamped to `count - 1`. The creator can delete openings after the chat starts.

### API

- `POST /chats` uses `openingIndex ?? 0` and saves it in the new column.
- New `PATCH /chats/:id/opening` with `{ openingIndex }`:
  - `400 invalid_opening` when the body is not valid or the index has no opening.
  - `404` when the chat is not the chat of the user, as the other chat endpoints do.
  - `404` when the user cannot send to the chat now (`characterAccess` is not `ok`), as `loadForReply` does.
    A `404` does not show that a hidden opening exists.
  - `409 chat_busy` when a reply streams for the chat now.
  - `409 opening_locked` when the chat has a message after message 0.
  - On success, it sets the text of message 0, `openingIndex`, and returns the new `ChatDetail`.
- The rule has two guards:
  1. The endpoint takes the busy mark of the chat, the same mark that `ReplyService.stream`
     uses. Then a send and an opening change never run at the same time on one API instance.
     The busy mark must move to a small shared provider, so `ChatsService` and
     `ReplyService` use one set.
  2. The write is one conditional update in a transaction: it changes message 0 only when
     the chat has no message with `position > 0`. A count of `0` updated rows gives `409 opening_locked`.
- An opening change does not set `editedAt` and does not change `lastMessageAt`.

### Web: character page

- `start-chat.tsx` drops the radio cards and the "How the story starts" heading.
- A signed-in user:
  - With one or more chats with the character (`GET /chats?characterId=<id>`, first item):
    "Continue latest chat" is the main button, and "Start a new chat" is the second button.
  - With no chat: "Start a new chat" is the main button.
- A visitor who is not signed in sees "Log in to chat", as today.
- "Start a new chat" sends `POST /chats` with only `characterId`.

### Web: chat page

- The arrows and the counter show when all these are true:
  - The chat has exactly one message (the opening).
  - `opening.count > 1`.
  - `canSend` is true.
- An arrow sends `PATCH /chats/:id/opening` and puts the returned `ChatDetail` in the query cache.
- The arrows are disabled while the request runs and while a reply streams.
- A `409 opening_locked` reloads the chat. A different error shows a short message near the counter.
- The reply choices show only after an AI reply with `position > 0` (`chat-view.tsx`), so they never
  show on an opening-only chat. The choices for the first reply answer the opening that the user sent with.
  This needs no change.
- The arrows are buttons with `aria-label` "Previous opening" and "Next opening". The
  counter has `aria-live="polite"`.

## Tests

- API: create without `openingIndex` uses opening 0. PATCH changes message 0 and the index.
  PATCH after a user message returns `409 opening_locked` and changes nothing. PATCH while
  busy returns `409 chat_busy`. PATCH by another user returns `404`. A bad index returns `400`.
- Web: the character page shows no openings, and shows "Continue latest chat" only with a chat.
  The chat page shows `1 / 3`, `>` goes to `2 / 3`, `<` goes back. No arrows with one
  opening. No arrows after a user message.

## Done when

The checklist of issue #29, plus: "Continue latest chat" opens the newest chat of the user with the character.

## Calls I made (check these)

- A new `openingIndex` column with a backfill, not a match of the text on each read.
  A stored value is the correct practice: a text match breaks when the creator edits an opening.
- The busy mark moves to a shared provider, so two services use one lock.
- `409 opening_locked` is a new error code, separate from `chat_busy`.
- The arrows hide when `canSend` is false, because the server refuses the change then.
- The index clamps to `count - 1` when the creator deleted openings.
