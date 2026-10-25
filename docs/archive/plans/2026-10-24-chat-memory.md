# Plan: chat memory and a cache-stable history window (issue #18)

Design: `docs/superpowers/specs/2026-10-24-chat-memory-design.md`.

## Task 1: Prompt memory section and page window

- Goal: `systemText` adds `## Memory`. `fitHistory` keeps whole pages. Export `windowStart`.
- Files: `apps/api/src/chats/prompt.ts`, `apps/api/src/chats/prompt.test.ts`.
- Tests: "memory section", "empty memory gives the same prompt", "prefix stays the same", "drops a full page", "newest message always goes in".
- Check: `pnpm --filter @wanderer/api exec vitest run --maxWorkers=1 src/chats/prompt.test.ts`

## Task 2: Data and shared contract

- Goal: `memory` and `memoryThroughPosition` columns, one migration, shared `MEMORY_MAX`, schemas, and types.
- Files: `apps/api/prisma/schema.prisma`, a new migration, `packages/shared/src/chats.ts`.
- Tests: none new (the types and the migration only).
- Check: `pnpm --filter @wanderer/api exec prisma validate`, then the shared typecheck.

## Task 3: Memory in the chat detail and in the prompts

- Goal: `ChatDetail.memory`. `loadForReply` returns the memory. The reply and the choices prompts get it.
- Files: `chats.service.ts`, `reply.service.ts`, `choices.service.ts`.
- Tests: in `apps/api/test/memory.e2e.test.ts`: "detail shows the memory", "reply prompt has the memory".
- Check: `vitest run --maxWorkers=1 test/memory.e2e.test.ts`

## Task 4: `PATCH /chats/:id/memory`

- Goal: save the memory and the marker, with validation and the owner check.
- Files: `chats.controller.ts`, `chats.service.ts`, `apps/api/test/memory.e2e.test.ts`.
- Tests: "saves", "400 over the limit", "400 marker after the last message", "404 for another user".
- Check: `vitest run --maxWorkers=1 test/memory.e2e.test.ts`

## Task 5: `POST /chats/:id/memory/summarize`

- Goal: a draft from the current memory and the messages between the marker and the window start.
- Files: new `memory.service.ts`, `prompt.ts` (summary prompt), `chats.controller.ts`, `chats.module.ts`.
- Tests: "sends only the uncovered old messages", "no proxy call when nothing is new", "does not save", "404 for another user".
- Check: `vitest run --maxWorkers=1 test/memory.e2e.test.ts`

## Task 6: Web memory panel

- Goal: a "Memory" button and panel with a counter, "Summarize", "Save" and "Cancel".
- Files: new `memory-panel.tsx`, new `memory-panel.test.tsx`, `chat-view.tsx`, the web API client.
- Tests: "shows the saved text", "summarize fills and does not save", "save sends the marker after a draft", "over the limit blocks save".
- Check: `pnpm --filter @wanderer/web exec vitest run --maxWorkers=1 memory-panel.test.tsx`

## Final gate

- Run the full gate one time: lint, typecheck, test and build, with `--concurrency=1`.
