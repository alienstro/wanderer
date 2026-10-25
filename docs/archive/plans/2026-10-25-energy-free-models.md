# Energy and Free Models (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new user chats at once on a free OpenRouter model with a server key, and each server-key action spends from a daily energy balance that an admin prices (issue #58, backend only).

**Architecture:** An `energy_entries` ledger and a `users.energy` balance in hundredths (integers). One `EnergyService` refills lazily at 00:00 UTC, spends with a conditional update before each model call, and refunds when the call gives no result. `ProxiesService.loadTarget` gives a free OpenRouter target when the user has no active own model. A typed `energy_settings` row, a `free_models` table and a `scene_models` table hold the admin values; admin endpoints change them and record an audit event.

**Tech Stack:** NestJS 12, Prisma 7 (PostgreSQL), zod 4, Vitest. No new dependency.

**Spec:** GitHub issue #58. The user said "just do it", so the open questions use the recommendations of the issue.

## Global Constraints

- Energy values are integers of hundredths in the database and in the code. Only the API edge and the display use decimals. `0.5` energy is `50`.
- 1 energy = $0.01, so 1 hundredth = $0.0001. Price = `ceil(cost × (1 + markup/100) / 0.0001)` hundredths, with a float tolerance (`45.00000000000001` is `45`).
- Text reply cost = `16,000 × prompt price + 400 × completion price` (USD for each token, from the paid version, the id without `:free`).
- A manual energy price wins over the OpenRouter price. A model markup wins over the group default. Empty means "use the default".
- Refill time: 00:00 UTC. The refill sets the balance to the daily amount. Unused energy does not carry over.
- `OPENROUTER_API_KEY` is optional. With no key, the free models are off and `no_active_proxy` stays as today. The key never goes into a response, a log, an event or a table.
- Defaults: daily energy 20, text markup 0%, image markup 0%, choices price 0, memory price 1, daily cap 950, scene model Flux Schnell at $0.003.
- Each admin endpoint is behind `SessionGuard` and `AdminGuard`. Each admin change records an `admin_change` app event with the admin, the old value and the new value. The prune keeps `admin_change` rows.
- Scope: API, Prisma and `packages/shared`. No web change in this branch, except a fixture that the shared types force.
- Tests: one file at a time, `NODE_OPTIONS=--max-old-space-size=1024`, `DATABASE_URL_TEST=postgresql://wanderer:wanderer@localhost:5433/wanderer_test_free_model`.

## Review Focus

- Two spends at the same time with energy for one: one succeeds, one gets `429 energy_low`; the balance is never below 0 (Task 3 test).
- A spend before 00:00 UTC that fails after the refill: the refund does not raise the balance above the daily amount (Task 3 test).
- A Stop of the user after some reply text: no refund, because the user got text. A failure with no text: a refund (Task 5 test).
- A picked free model that the admin turns off or removes: the next reply uses the default free model, not `no_active_proxy` (Task 4 test).
- A float price such as `0.003 × 1.5`: the price is `45`, not `46` (Task 1 test).

---

### Task 1: Shared energy math and schemas

**Files:**
- Create: `packages/shared/src/energy.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/proxies.ts` (add `free_model_busy` to `AI_ERROR_CODES` and `AI_ERROR_TEXT`)
- Test: `packages/shared/src/energy.test.ts`

**Interfaces:**
- Produces: `ENERGY_USD = 0.01`, `REPLY_PROMPT_TOKENS = 16_000`, `REPLY_COMPLETION_TOKENS = 400`.
- Produces: `energySchema` (zod: number ≥ 0, ≤ 2 decimals, ≤ 1,000,000, output hundredths `number`).
- Produces: `toEnergy(hundredths: number): number`, `energyPrice(costUsd: number, markupPercent: number): number` (hundredths), `textReplyCostUsd(promptUsd: number, completionUsd: number): number`, `energyUsdValue(hundredths: number): number`.

- [ ] Test `energyPrice`: `energyPrice(0.00336, 50) === 51`, `energyPrice(0.003, 0) === 30`, `energyPrice(0.003, 50) === 45`, `energyPrice(0, 0) === 0`.
- [ ] Test `textReplyCostUsd(0.0000002, 0.0000004)` is `0.00336` (to 10 places).
- [ ] Test `energySchema`: `0.5 → 50`, `99.75 → 9975`, `0.555` fails, `-1` fails. `toEnergy(9950) === 99.5`. `energyUsdValue(30) === 0.003`, `energyUsdValue(1) === 0.0001`.
- [ ] Implement, then run: `pnpm --filter @wanderer/shared exec vitest run src/energy.test.ts --maxWorkers=1`. Commit.

### Task 2: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261025200000_energy_free_models/migration.sql`
- Test: `apps/api/test/energy-schema.int.test.ts`

**Interfaces:**
- Produces: `User.energy Int @default(0)`, `User.energyRefilledAt DateTime?`, `User.freeModelId String?` (FK `free_models`, SET NULL).
- Produces: enum `EnergyReason { reply choices memory scene refund refill }`; model `EnergyEntry { id, userId, amount Int, reason, chatId?, freeModelId?, refundOfId? @unique, createdAt }`, indexes `(userId, createdAt)`, `(reason, createdAt)`.
- Produces: model `FreeModel { id, openrouterId @unique, displayName, enabled, isDefault, sortOrder, promptPriceUsd Decimal?, completionPriceUsd Decimal?, pricesFetchedAt?, markupPercent Int?, manualEnergyPrice Int?, createdAt, updatedAt }`, partial unique index on `is_default` where true.
- Produces: model `SceneModel { key @id, costUsd Decimal, markupPercent Int?, enabled }`; seed rows `flux-schnell` (0.003) and `z-image-turbo` (0.005).
- Produces: model `EnergySettings { id Int @id @default(1), dailyEnergy 2000, choicesPrice 0, memoryPrice 100, sceneModelKey "flux-schnell", textMarkupPercent 0, imageMarkupPercent 0, freeDailyCap 950, updatedById?, updatedAt }`; one seed row; SQL `CHECK` for `id = 1` and each value ≥ 0.
- Produces: `AppEventType` + `energy_too_low`, `free_model_busy`, `admin_change`; `AppEvent.details Json?`.

- [ ] Test: the settings row exists with the defaults; an update to `daily_energy = -1` fails; a second `is_default = true` row fails.
- [ ] Write the schema and the SQL; run `pnpm --filter @wanderer/api exec prisma generate`.
- [ ] Run: `pnpm --filter @wanderer/api exec vitest run test/energy-schema.int.test.ts --maxWorkers=1`. Commit.

### Task 3: EnergyService (ledger, refill, spend, refund)

**Files:**
- Create: `apps/api/src/energy/energy.service.ts`, `apps/api/src/energy/energy.module.ts` (global)
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/events/events.service.ts` (prune skips `admin_change`)
- Test: `apps/api/test/energy.int.test.ts`

**Interfaces:**
- Produces: `EnergyService.settings(): Promise<EnergySettings>` (reads the row at each call).
- Produces: `EnergyService.balance(userId): Promise<{ balance: number; dailyEnergy: number; nextRefillAt: Date }>` (hundredths; refills first).
- Produces: `EnergyService.spend(userId, price, reason, links: { chatId?: string; freeModelId?: string }): Promise<EnergySpend>`; throws `HttpException(429, { error: "energy_low", balance, price, nextRefillAt })` (decimals at the edge) and records `energy_too_low`.
- Produces: `EnergyService.refund(spend: EnergySpend): Promise<void>` (idempotent with `refundOfId`; no refund when a refill came after the spend).
- Produces: `EnergyService.freeRequestsToday(): Promise<number>` (spend rows with a `freeModelId` since 00:00 UTC).

- [ ] Test "200 spends of 0.5 from 100 leave exactly 0", "two spends at the same time with energy for one", "refill sets the daily amount, not more", "refund gives the energy back once", "no refund after a refill".
- [ ] Implement the spend as one `updateMany` with `energy: { gte: price }` and the entry insert in one transaction; the refill with `SELECT … FOR UPDATE`.
- [ ] Run: `pnpm --filter @wanderer/api exec vitest run test/energy.int.test.ts --maxWorkers=1`. Commit.

### Task 4: Free model target

**Files:**
- Modify: `apps/api/src/config/env.ts` (`OPENROUTER_API_KEY` optional), `apps/api/src/proxies/proxies.service.ts`, `apps/api/src/proxies/proxies.module.ts`
- Create: `apps/api/src/free-models/free-models.ts` (pricing and choice functions)
- Test: `apps/api/test/free-models.e2e.test.ts`

**Interfaces:**
- Produces: `OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"`.
- Produces: `textEnergyPrice(model: FreeModel, settings: EnergySettings): number | null` (null: no paid price and no manual price).
- Produces: `loadTarget(user)` returns `{ target, customPrompt, contextTokens, free: FreeModel | null }`. Own active proxy first; else the picked free model when it is enabled and priced; else the default free model; else `409 no_active_proxy`.

- [ ] Test "a new user with no model gets a reply from the default free model with the server key", "a user who picked a model that is now off uses the default", "with no OPENROUTER_API_KEY a new user gets 409 no_active_proxy".
- [ ] Run: `pnpm --filter @wanderer/api exec vitest run test/free-models.e2e.test.ts --maxWorkers=1`. Commit.

### Task 5: Spend on replies, choices and memory

**Files:**
- Create: `apps/api/src/energy/ai-charge.ts`
- Modify: `apps/api/src/chats/reply.service.ts`, `apps/api/src/chats/choices.service.ts`, `apps/api/src/chats/memory.service.ts`
- Test: `apps/api/test/energy-spend.e2e.test.ts`

**Interfaces:**
- Produces: `AiCharge.chargeText(user, free: FreeModel | null, action: "reply" | "choices" | "memory", chatId): Promise<EnergySpend | null>` (null for an own model; checks the daily cap first: `503 { error: "free_model_busy" }` plus event `free_model_busy` reason `cap`).
- Produces: `freeAiError(code: AiErrorCode, free: boolean): AiErrorCode` (`rate_limited`, `usage_limit`, `no_credit` become `free_model_busy` on a free model; records event reason `rate_limited`).

- [ ] Tests: "a free reply takes the reply price", "an own-model reply takes nothing", "a free reply that fails with no text gives the energy back", "OpenRouter 429 gives free_model_busy and a refund", "choices with the switch off on a free model give 409 choices_off and take nothing", "choices price 0.5 leaves 99.5", "low energy gives 429 energy_low before a model call", "the daily cap stops free replies but not own models".
- [ ] Reply: spend before `openSse`, so `energy_low` stays JSON; refund when the saved reply is null and the user did not stop it.
- [ ] Run: `pnpm --filter @wanderer/api exec vitest run test/energy-spend.e2e.test.ts --maxWorkers=1`. Then the old `chat-stream`, `choices`, `memory`, `regenerate` tests, one at a time. Commit.

### Task 6: Scene models and scene spend

**Files:**
- Create: `apps/api/src/scenes/scene-models.ts`
- Modify: `apps/api/src/scenes/runpod-client.ts`, `apps/api/src/scenes/scenes.service.ts`, `packages/shared/src/chats.ts` (remove `SCENE_DAILY_LIMIT`, add `SCENE_MODEL_KEYS = ["flux-schnell", "z-image-turbo"]`)
- Test: `apps/api/src/scenes/runpod-client.test.ts`, `apps/api/test/scenes.e2e.test.ts`

**Interfaces:**
- Produces: `SCENE_MODELS: Record<SceneModelKey, { label: string; endpointId: string; input(request: SceneImageRequest): object }>`.
- Produces: `SceneImageRequest` + `model: SceneModelKey`, `adult: boolean`. Z-Image input: `{ prompt, size: "1024*1024", seed: -1, enable_safety_checker: !adult }`.
- Consumes: `EnergyService.spend(…, "scene", { chatId, freeModelId })` with the price of the active scene model; refund on each failure.

- [ ] Tests: "z-image-turbo posts size and the endpoint id", "a scene takes 0.3 from a user with an own model", "a failed image gives the energy back", "two clicks at the same time with energy for one give one image and one refusal" (replace the old `scene_limit` tests).
- [ ] Run each test file alone. Commit.

### Task 7: OpenRouter prices

**Files:**
- Create: `apps/api/src/ai/openrouter-prices.ts`
- Modify: `apps/api/src/ai/model-list.ts` (export `readCapped`)
- Test: `apps/api/src/ai/openrouter-prices.test.ts`

**Interfaces:**
- Produces: `OPENROUTER_PRICES_CLIENT` token; `OpenRouterPricesClient.list(): Promise<Map<string, { prompt: number; completion: number }>>`; `paidId(openrouterId): string` (drops `:free`). Throws `ModelListError` on failure.

- [ ] Tests: parses `pricing.prompt` and `pricing.completion` strings; drops an item with no numbers; `paidId("google/gemma-4-31b-it:free") === "google/gemma-4-31b-it"`.
- [ ] Run: `pnpm --filter @wanderer/api exec vitest run src/ai/openrouter-prices.test.ts --maxWorkers=1`. Commit.

### Task 8: Admin endpoints for energy and models

**Files:**
- Create: `apps/api/src/admin/energy-admin.service.ts`, `apps/api/src/admin/energy-admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`, `packages/shared/src/admin-energy.ts` (+ index export)
- Test: `apps/api/test/admin-energy.e2e.test.ts`

**Interfaces:**
- Produces: `GET /admin/energy` → `AdminEnergyView { settings, freeModels: AdminFreeModel[], sceneModels: AdminSceneModel[] }`; each row has `costUsd`, `markupPercent` (in use), `ownMarkup`, `energyPrice`, `usdValue`, `pricesFetchedAt`.
- Produces: `PUT /admin/energy/settings`, `POST /admin/energy/free-models`, `PATCH|DELETE /admin/energy/free-models/:id`, `POST /admin/energy/free-models/test`, `POST /admin/energy/prices/refresh`, `PUT /admin/energy/scene-models/:key`.
- Produces: a daily price refresh timer (like the event prune). A failed read keeps the last prices.

- [ ] Tests: "a non-admin gets 403", "adding gemma reads its paid prices", "markup 50% gives 0.51", "model markup 100% wins; cleared uses the default", "no paid version cannot be enabled without a manual price", "a failed refresh gives 502 and keeps prices", "a price of 0.555 or below 0 gives 400", "scene price 0.3, with 50% 0.45", "each change records admin_change with old and new values", "the response holds no key".
- [ ] Run: `pnpm --filter @wanderer/api exec vitest run test/admin-energy.e2e.test.ts --maxWorkers=1`. Commit.

### Task 9: User energy endpoints

**Files:**
- Create: `apps/api/src/energy/energy.controller.ts`, `apps/api/src/free-models/free-models.controller.ts`
- Modify: `packages/shared/src/energy.ts` (`EnergyView`, `FreeModelView`)
- Test: `apps/api/test/user-energy.e2e.test.ts`

**Interfaces:**
- Produces: `GET /energy` → `{ balance, dailyEnergy, nextRefillAt, prices: { reply: number | null, choices, memory, scene } }` (decimals).
- Produces: `GET /free-models` → `FreeModelView[]` (`id, displayName, energyPrice, isDefault, isActive`); `POST /free-models/:id/activate` sets `freeModelId` and clears `activeProxyId`.

- [ ] Tests: "a new user sees 20 energy", "a user picks a free model and the next reply uses it".
- [ ] Run the file alone. Commit.

### Task 10: Overview numbers

**Files:**
- Modify: `apps/api/src/admin/overview.service.ts`, `packages/shared/src/admin.ts`
- Test: `apps/api/test/admin-overview.e2e.test.ts`

**Interfaces:**
- Produces: metrics with `kind: "energy"`: `freeReplies`, `freeUsers`, `energyReply`, `energyChoices`, `energyMemory`, `energyScene` (decimals), `energyTooLow`, `freeModelBusy`. `OverviewHealth` + `freeReplies`, `freeModelBusy`.

- [ ] Test: "3 free replies by one user and 2 by another give 5 free replies and 2 free users today".
- [ ] Run the file alone, then the full gate one time: `pnpm run verify` (or lint, typecheck, test, build in turn). Commit.
