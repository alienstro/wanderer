# 0003: The server secrets are in the env, not in the database

- Date: 2026-10-25 (records a decision from the first release)
- Status: Accepted

## Context

The API needs secrets of its own: the Google OAuth secret, the cookie secret, the master key for the
saved API keys, and the keys for RunPod and OpenRouter. An admin can change many settings in the admin
screens, so the database could also hold these secrets.

## Decision

- The server secrets are env values only: `GOOGLE_CLIENT_SECRET`, `COOKIE_SECRET`,
  `KEY_ENCRYPTION_KEY`, `RUNPOD_API_KEY` and `OPENROUTER_API_KEY`.
- `apps/api/src/config/env.ts` checks each value with zod when the API starts. A bad value stops the start.
- Dokploy holds the production values. `apps/api/.env.docker.example` shows the names with test values.
- A secret never goes into a response, a log, an app event or a table.
- The database holds only the API keys of the users, encrypted (see [0002](0002-api-keys-encrypted-at-rest.md)).

## Other options

- **Secrets in a database table that an admin edits:** a leaked database or an admin account with a
  weak password shows the secrets. The master key cannot be in the database that it protects.

## Result

- A secret change needs a redeploy in Dokploy. This is acceptable, because the secrets change rarely.
- The admin screens never show a server secret.
