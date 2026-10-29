# Decisions (ADRs)

Each file records one architecture decision: the context, the decision, and the result.
A decision stays true until a new ADR replaces it.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | One API app and one web app, split into feature modules | Accepted |
| [0002](0002-api-keys-encrypted-at-rest.md) | The saved API keys are encrypted at rest | Accepted |
| [0003](0003-secrets-in-env.md) | The server secrets are in the env, not in the database | Accepted |
| [0004](0004-energy-in-hundredths.md) | Energy is stored as whole hundredths | Accepted |
| [0005](0005-no-adult-content.md) | Wanderer has no 18+ content | Accepted |

## Add an ADR

1. Copy the last ADR, and give it the next number.
2. Write the context, the decision, the other options, and the result. Keep it short.
3. Add a row to the table above.
4. If the new ADR replaces an old one, set the status of the old one to "Replaced by NNNN".
