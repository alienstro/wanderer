# Chat memory and a cache-stable history window (issue #18)

## Intent

Each reply sends the system part and the newest messages to the proxy of the user.
A long chat sends a big context on each reply, and the user pays for each token.
This design lowers that cost in two ways:

1. A **memory** text for each chat keeps the important facts. The facts stay in the
   prompt after their messages leave the history window. Then a small window is safe.
2. The history window drops old messages **in large steps**, not one message at a
   time. The start of the prompt then stays the same for many replies, and the cache
   of the provider (OpenAI, Anthropic, DeepSeek, OpenRouter) can match it.

The user controls the memory. The AI writes a draft only when the user asks for it,
and the user reads and edits the draft before the save.

## Goals

- The character knows the facts in memory after 100 or more new messages.
- The prompt prefix (system part plus the oldest kept messages) stays the same between
  most replies, so the provider cache hits.
- One "Summarize" click costs about one reply or less. It never sends the full chat.
- A chat with an empty memory and a short history gives the same prompt as today.

## Non-goals

- An automatic summary in the background. The AI can write wrong facts, and the user
  does not see them.
- A search over old messages with embeddings.
- A memory that the user shares across chats or characters.
- A setting for the window size. Issue #17 adds it as the `contextTokens` of each
  proxy (default 16,000). This design reads that value as the budget.

## Anti-goals

- "Summarize" sends all old messages. A long chat then costs more for one click than
  for many replies.
- Memory changes on each reply. A change in the system part breaks the cache.
- The AI saves the memory without the user.

## Data

Add two columns to `Chat` in `apps/api/prisma/schema.prisma`, with one migration:

| Column | Type | Meaning |
|---|---|---|
| `memory` | `String @default("")` | The memory text. Max 2,000 characters. |
| `memoryThroughPosition` | `Int?` `@map("memory_through_position")` | The last message position that a saved summary covers. Null means "none". |

Positions are stable and can have gaps after a delete, so a position is a safe marker.

## Shared contract (`packages/shared/src/chats.ts`)

- `MEMORY_MAX = 2000`.
- `memoryInputSchema = z.object({ memory: z.string().trim().max(MEMORY_MAX), throughPosition: z.number().int().min(0).nullable().optional() })`.
- `ChatDetail` gets `memory: { text: string; throughPosition: number | null }`.
  The chat page already loads `ChatDetail`, so it needs no separate `GET`.
- `MemoryDraftResponse = { memory: string; throughPosition: number }`.

## API

All routes use the same owner check as the other chat routes. The chat of another
user gives 404.

- `PATCH /chats/:id/memory` saves `memory`. When the body has `throughPosition`, the
  route saves it too. The route gives 400 when the text is over `MEMORY_MAX`. It
  gives 400 when `throughPosition` is greater than the last message position.
  It returns the new `memory` object.
- `POST /chats/:id/memory/summarize` returns a `MemoryDraftResponse` and saves
  nothing. It uses the same throttle as `/choices`.

### What "Summarize" sends

1. Find the window start: the first message that `fitHistory` keeps (see below).
2. Take the messages with `position > memoryThroughPosition` (or all, when it is
   null) and `position <` the window start. These are the messages that left the
   window and that no saved summary covers.
3. Keep the oldest of them up to a token cap (`summaryInputTokens`, half of
   `contextTokens`). The user can click again to cover the rest.
4. When the list is empty, return the current memory and the current marker. Do not
   call the proxy.
5. Send one system message with the instruction, the current memory, and the
   messages. The instruction asks for one updated memory text: keep the old facts,
   add the new facts (names, promises, debts, places, relations, open goals), remove
   facts that changed, use short lines, and stay under 2,000 characters.
6. Return the answer as `memory` (trimmed and cut to `MEMORY_MAX`), and the position
   of the last message sent as `throughPosition`.

So "Summarize" merges: the draft is the old memory plus the new facts. It does not
add a second block, and it does not throw away the old text.

## Prompt (`apps/api/src/chats/prompt.ts`)

### Memory section

`PromptInput` gets `memory: string`. `systemText` adds `["Memory", input.memory]`
after "Example dialogs". The empty filter already skips an empty memory, so an empty
memory gives the same system text as today. `fill` replaces `{{char}}` and
`{{user}}` in memory too. The memory counts against the context budget, because it
is in the system part.

### Cache-stable window

Replace the trim in `fitHistory`:

1. Split the full history into **pages**, from the oldest message. A page takes
   messages until its tokens reach a quarter of `contextTokens`. A message
   bigger than a page makes its own page.
2. Keep the newest pages that fit in the budget, together with the system part and
   the extra parts (the choices instruction).
3. When the newest page alone does not fit, keep the newest messages that fit, as
   today. The newest message always goes in.

Pages start at the oldest message, so a new message changes only the last page. The
kept prefix then stays the same until the window drops a full page. When the history
fits in the budget, the result is the same as today.

The function also returns the position of the first kept message. "Summarize" uses it
as the window start. Export a helper, for example
`windowStart(input, extraTokens): number`, so the reply, the choices, and the
summary use one rule.

Caution: an edit or a delete of an old message moves the page limits after it. That
breaks the cache one time. This is acceptable.

## Web (`apps/web/src/app/(shell)/chats/[id]/`)

- A "Memory" button in the chat header opens a panel (a side sheet on desktop, a
  bottom sheet on mobile). Follow the reference apps and the current look of the app.
- The panel has a textarea with a counter (`n / 2000`), a "Summarize" button, a
  "Save" button, and a "Cancel" button.
- "Summarize" puts the draft in the textarea and keeps the returned
  `throughPosition` in the state. It does not save. A short note shows "Draft, not
  saved".
- When the draft is the same as the saved memory and has the same marker, the panel
  shows "No new messages to summarize".
- "Save" sends `PATCH` with the text, and with `throughPosition` only when the text
  comes from a draft. An edit after a draft still sends the draft marker.
- The counter turns red over the limit, and "Save" is off.
- An error from the proxy shows the same messages as the reply errors.

## Tests

- `prompt.test.ts`: the memory section shows only when the memory is not empty; an
  empty memory gives the same prompt as before; the pages keep the same prefix while
  new messages come in; the window drops a full page when the budget is full; the
  newest message always goes in.
- API: `PATCH` saves and gives 400 over the limit; the chat of another user gives 404;
  summarize sends only the messages after the marker and before the window; an empty
  list makes no proxy call.
- Web: the panel shows the saved text; "Summarize" fills the textarea and does not
  save; "Save" sends the marker only after a draft; the counter blocks "Save" over the
  limit.

## Calls made by the designer

These are my decisions. Check them while you read.

1. "Summarize" merges the new facts into the current memory.
2. The memory comes in `ChatDetail`, not from a separate `GET`.
3. A `memoryThroughPosition` marker prevents a second summary of the same messages.
4. One summary covers at most half of the context budget of old messages.
5. A page is a quarter of the budget, so the window drops about a quarter at a time.
6. The window size is the `contextTokens` of the proxy from #17.
