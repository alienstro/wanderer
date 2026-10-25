# 0002: The saved API keys are encrypted at rest

- Date: 2026-10-25 (records a decision from the first release)
- Status: Accepted

## Context

A user saves an API key for an AI provider. The API sends this key to the provider for each reply.
The API must read the plain key, so a one-way hash is not possible. A copy of the database, such as a
backup, must not show the keys.

## Decision

- `apps/api/src/api-keys/key-cipher.ts` encrypts each key with AES-256-GCM before the API saves it.
- Each key gets a new 12-byte IV.
- The ID of the key row is in the AAD. A ciphertext that moves to another row does not decrypt.
- Each sealed key has a version. Version 1 came from the proxy rows. Each new key is version 2.
- The master key is `KEY_ENCRYPTION_KEY` in the env (see [0003](0003-secrets-in-env.md)).
- The API never sends the full key to the browser. It sends only the last 4 characters (`keyLast4`).

## Other options

- **Plain text in the database:** a leaked backup shows each key.
- **A cloud key service (KMS):** stronger, but it adds a paid service and a network call to each
  reply. Not necessary at this size.

## Result

- A leaked database or backup does not show the keys without the master key.
- A lost `KEY_ENCRYPTION_KEY` makes all saved keys useless. Keep a copy of it in a safe place.
- A key rotation needs a script that decrypts with the old key and encrypts with the new key.
