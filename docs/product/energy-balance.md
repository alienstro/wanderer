# The sidebar shows the energy balance (issue #65)

Date: 2026-10-25
Status: draft for review

## Intent

Free models and the daily energy came in PR #61 (release 1.5.0). Each reply, set of reply choices,
memory draft and scene image on a server key costs energy. The balance refills to the daily amount
at 00:00 UTC.

The web does not show the balance now. A user finds out about low energy only when an action fails.
Then the page shows "You sent many messages in a short time", which is not the cause. The user
waits a minute, fails again, and can wait hours with no reason given.

This design shows the balance, the refill time and the scene price all the time. When an action
costs more than the balance, the page tells the user why it failed and when to try again.

## Goals

- Each signed-in user sees "Energy <balance> / <daily amount>", a bar, and the refill time in
  the sidebar.
- The balance changes after each action, with no page reload.
- A failed spend says "Not enough energy", with the price, the balance and the refill time.
- The "Generate scene" button shows the price of one scene image.

## Non-goals

- A way to buy energy.
- A change to the prices, the daily amount or the refill time.
- A history of the spent energy.
- A warning before the balance is low. The user decided against it.

## Anti-goals

- A real rate limit (a 429 with no `energy_low`) must not show the energy message.
- The page must not show a balance that does not match the last action.
- The page must not disable a button without a reason that the user can see.

## Decisions of the user

- Each user with a session sees the energy in the sidebar. This includes a user with their own
  API key, because each scene image costs energy for each user
  (`apps/api/src/scenes/scenes.service.ts:32`).
- The card shows the number and a bar (mockup option B).
- The bar has one color at each level. There is no low-energy warning.
- The toast text below is approved.

## The sidebar card

The model card (`apps/web/src/features/shell/components/model-card.tsx`) gets an energy part under
the model lines.

| User | Model lines | Energy label |
|---|---|---|
| Free model | "Model", then the free model name | "Energy" |
| Own API key | "Model", the proxy name, the model id (as now) | "Energy for scenes" |
| No model | "Model", then "Add a model" (as now) | "Energy for scenes" |

The energy part has three lines:

1. The label on the left, "12 / 50" on the right.
2. A bar. Its width is `balance / dailyEnergy`, from 0% to 100%.
3. "Refills at 8:00 AM" in the local time of the browser.

A visitor sees no card, as now.

### The rail

The rail (the narrow sidebar) hides the model card now. In the rail, a small energy icon with the
balance number shows in place of the card. A hover or a keyboard focus shows the full text, such as
"Energy 12 / 50. Refills at 8:00 AM." The text uses the `.side-label` tooltip of the other rail items.

## The data

### API change

`GET /energy` does not return the name of the free model. Add `freeModelName: string | null` to
`EnergyView` in `packages/shared/src/energy/energy.ts`. Fill it in `FreeModelsService.energyView`
(`apps/api/src/free-models/free-models.service.ts:73`). The value is null when `model` is not
`"free"`.

This keeps the card on one request. A second request to `GET /free-models` for one name is
slower and has two loading states.

### The web query

- One hook, `useEnergy()`, loads `GET /energy`. The card, the scene button and the chat read this
  one query. The key is `["energy", userId, proxyId]`, because a logout does not clear the cache.
  A new user or a new model loads the energy again. A refresh uses the `["energy"]` prefix.
- The query runs only when `useMe()` has a user.
- The page refetches `["energy"]` after each of these events:
  - a send or a regenerate ends, with any result. The API refunds a failed reply, so the page
    refetches in all cases,
  - a set of reply choices loads,
  - a memory draft ends, with a result or an error,
  - a scene image ends, with a result or an error,
  - each `energy_low` error.
- After `nextRefillAt`, the page refetches `["energy"]` one time, so the card shows the full
  amount with no reload. The wait stays from 1 minute to 1 day. A longer timer delay runs at once,
  and a wrong clock can show the refill in the past.
- The page also refetches the energy when the user comes back to the tab, because the timer stops
  in a hidden tab.

## The energy message

The page reads `error: "energy_low"` before the general 429 check, in each place that spends
energy. The 429 body has `balance`, `price` and `nextRefillAt`.

One helper makes the text, so each place uses the same words. The toast is the error toast that
the chat uses now (`ERROR_TOAST_ID`).

| Action | Title | Description |
|---|---|---|
| Send, regenerate | Not enough energy | A reply costs 2 energy. You have 1.5. Your energy refills at 8:00 AM. |
| Generate scene | Not enough energy | A scene image costs 5 energy. You have 3. Your energy refills at 8:00 AM. |
| Memory draft | (the error line of the panel) | A memory summary costs 1 energy. You have 0.5. Your energy refills at 8:00 AM. |

The other 429 errors keep their old text.

## The scene price

The "Generate scene" button shows the price after the label: "Generate scene · 5 ⚡". The price is
`prices.scene` from `GET /energy`. While the energy loads, the button shows only the label.

## Calls of the builder

These choices are mine, not the user's. The user can change each one.

- The free model name comes from a new field on `GET /energy` (see "API change").
- The toast shows only the clock time, not "tomorrow". The refill is always less than 24 hours
  away.
- The "Generate scene" button stays active when the balance is low. A click shows the reason.
- The rail hover uses the `.side-label` tooltip of the other rail items, not the `title` attribute.
- The energy display parts go in a new web feature folder, `apps/web/src/features/energy/`. The
  shell and the chats import it through its `index.ts`.
- The numbers show with no trailing zeros, such as 1.5 and 12. The API already sends them so.
- The text of the memory draft message follows the approved toast text.
- When `GET /energy` fails, the card shows the model lines and no energy part.
- The bar width stays from 0% to 100%. An admin can give more than the daily amount, and the
  daily amount can be 0.

## Known gaps, not in this issue

- The chat shows reply choices only when `me.activeProxy` is set
  (`apps/web/src/features/chats/components/chat-view.tsx:101`). So a user on a free model gets no
  reply choices now, and never pays for them. This design refetches the energy after choices, so
  it is ready when a later issue fixes that check.
- "Generate scene" is disabled when `me.activeProxy` is null, but the API also makes scene images
  on a free model. So a user on a free model cannot make a scene image now. A later issue can fix
  this check.

## Done when

- A user on a free model sees "Energy <balance> / <daily amount>" and a bar in the sidebar card.
- A user with their own API key sees "Energy for scenes" with the balance and the bar.
- The card shows the next refill time in the local time of the user.
- After one reply, the balance goes down by the reply price with no page reload.
- With a balance below the reply price, a send shows "Not enough energy" with the refill time.
- With a balance below the scene price, "Generate scene" shows "Not enough energy" with the
  refill time.
- The "Generate scene" button shows the scene price.
- A real rate limit (429 with no `energy_low`) still shows the rate-limit message.
- After 00:00 UTC, the card shows the full daily amount with no reload.
