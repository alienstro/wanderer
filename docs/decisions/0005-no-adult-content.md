# 0005: Wanderer has no 18+ content

- Date: 2026-10-29
- Status: Accepted
- Issue: #86

## Context

Wanderer had an 18+ category. A creator marked a character 18+, and a user saw it only after an age
confirm and with "Show 18+" on.

Wanderer will sell energy through Paddle (#85). The Paddle Acceptable Use Policy (updated
13 April 2026) prohibits "Adult and other age-restricted content", "sexually-oriented or pornographic
products or services", and "any content generation that falls into other prohibited categories".
Paddle support cannot approve a prohibited category. Paddle checks the live site when it reviews the
account.

## Decision

- Wanderer has no 18+ category. All characters, chats and scene images are safe for work.
- The chat system prompt ends with a content rule: no sexual content, no nudity and no sexual
  roleplay. The rule comes after the user instructions and the memory, because the user writes both.
- Each scene image asks for a safe image, and the Z-Image Turbo safety checker is always on.
- The report reason `wrong_rating` becomes `sexual_content`. A comment can get this reason too.
- The minimum user age stays 18.
- The old 18+ characters are deleted in two steps, because the API image runs the migrations before
  the server starts:
  1. PR A removes the feature and hides each old 18+ row. The one-time command
     `node dist/scripts/delete-adult-characters.js [--dry-run]` deletes the rows, the chats, the
     scene images, the avatars and their bytes in the storage.
  2. PR B drops `characters.is_adult`, `users.show_adult` and `users.adult_confirmed_at`, after the
     command ran on production.

## Other options

- **Ask Paddle for an exception:** the policy puts adult content in a prohibited category, not in a
  restricted one, so Paddle cannot approve it.
- **Another payment provider for adult content:** these providers cost more and do not act as the
  Merchant of Record for the tax.
- **One SQL migration that deletes the 18+ rows:** it cannot remove the image bytes in the storage.
- **Hide the old 18+ characters and keep the rows:** the user chose to delete them.

## Result

- Paddle can review the account.
- The prompt rule does not stop each case. A user can use their own model and their own custom
  prompt. The Report button and the admin stay the controls. A moderation check on each reply is a
  possible later step.
- The delete cannot be undone. Take a database backup before the command runs on production.
