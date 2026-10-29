# Wanderer: design for version 1

> **Status (2026-10-25):** The team wrote this spec before the build. The feature is in the app now. Later issues changed some parts. When this file and the code do not agree, the code is correct.

Date: 2026-10-21
Status: draft for review
Prototype: https://claude.ai/artifact/GSHNLLcJi5LXA6KiiPVZMS (the approved screens and look)

## 1. Intent

Wanderer is a public web app for text roleplay with AI characters. Users make characters, find
characters that other people made, and chat with them. Janitor AI, character.ai, and StoryEngine
are the reference apps.

The owner runs Wanderer for a few users, free of charge, on their own server. Each user brings
their own AI model through an OpenAI-compatible proxy. So Wanderer pays for no AI calls.

## 2. Goals, non-goals, and anti-goals

### Goals

- A user logs in with Google, makes a character, and chats with it in a few minutes.
- The chat feels like the prototype: replies stream word by word, and four reply choices help a
  user who does not want to type.
- Any OpenAI-compatible provider works through one form: OpenRouter, Gemini, DeepSeek, and others.
- The owner can remove bad content and ban users without a database tool.
- The app runs on one Dokploy server with low memory use.

### Non-goals for version 1

- No images made by AI, no voice, and no game rules such as dice, stats, or maps.
- No payments, no plans, and no usage limits for money.
- No AI models that Wanderer pays for. Each user brings a proxy.
- No email alerts and no notifications. The prototype bell icon does not go into version 1.
- No automatic content moderation by AI.
- No mobile app. The web app works at phone width.
- No group chats with more than one character.

### Anti-goals (a failure even if the features work)

- An API key leaks to a browser, a log, or another user.
- A proxy URL lets a user reach the owner's private network (SSRF).
- A chat or a scene image has sexual content.
- One user can read the private chats or private characters of another user.
- A lost disk deletes all the data because no backup exists.

## 3. Users, scale, and hosting

- **Users:** a few people. All features are free.
- **Server:** the owner's Dokploy server, reached as `root@main`. Postgres runs as a Dokploy service.
- **Addresses:**
  - frontend: `https://wanderer.alienstro.xyz`
  - backend: `https://wanderer-api.alienstro.xyz`
- **Network:** a Cloudflare Zero Trust tunnel (`cloudflared`) sends both addresses to the server.
  The server opens no public web ports.
- **Repository:** https://github.com/alienstro/wanderer (private).
- **Scale rule:** one container for each app, no Redis, and no job queue. Add one only when a real
  need shows up.

## 4. Features

### 4.1 Login, Terms, and Privacy

- Google is the only login method. There are no passwords.
- The login page has the checkbox "I agree to the Terms of Service and the Privacy Policy". Both
  names link to their pages. The "Continue with Google" button stays disabled until the user ticks
  the box.
- The backend saves the version of the terms that the user accepted, and the time.
- When the owner raises the terms version, each user must accept again at the next login.
- `/terms` and `/privacy` are public pages. Google needs the privacy link for its login screen.
- At the first login, the user picks a unique handle, such as `@tian`. The form fills in a
  suggestion from the email name. *(My call.)*
- The first version of the Terms and the Privacy Policy is a draft. A person with legal knowledge
  must check it before the owner invites users.

The Terms must include at least:

- A user must be 18 or older.
- Sexual content of any kind is forbidden, also with a character that looks or acts like a minor.
- What is not allowed, such as hate, harassment, and copied characters.
- The owner can hide or delete characters and ban accounts.
- Each user is responsible for their own proxy, key, and the rules of their AI provider.

The Privacy Policy must include at least:

- Wanderer stores the Google name, email, and picture, the characters, the chats, and the proxy
  keys in encrypted form.
- Wanderer does not sell or share data. Chat text goes only to the proxy that the user picks.
- A user can delete their account and all their data in the settings.

### 4.2 Home and Discover

- A left sidebar has Create, Discover, For you, My characters, a Recent list of chats, the active
  model card, and the user row. On a phone, the sidebar becomes a top bar.
- "Welcome back, {name}" and a "Continue your chat" banner with the last line of the latest chat.
- **For you:** characters with the tags that the user chats with most.
- **Popular stories:** tall image cards with a chat count, tags, and the creator.
- **Search:** title, chat name, tags, and creator handle.
- **Filters:** one tag at a time, and the sort "Most chats" or "Newest".
- Page content fills the width next to the sidebar. Only long text lines have a width limit.
- Visitors without a login can see Discover and character pages. A chat needs a login.
  *(My call. See section 12.)*

### 4.3 Character page

- A banner with a blurred copy of the image, the image, the title, "Chat with {name}", the creator,
  the chat count, the bio, and the tags.
- **Start a new chat**, after the user picks one of the first messages ("How the story starts").
- **Your chats:** the chats of this user with this character, with open and delete.
- **Definition:** the Personality and the Scenario, or the text "The creator keeps the definition of
  this character hidden."
- **Owner panel:** Public or Private, Definition visible or hidden, Edit, and Delete with a confirm
  step on the page.
- **Report** button for other users (section 4.8).

### 4.4 Create and edit a character

Fields, in the order of the prototype:

| Field | Rule |
|---|---|
| Avatar | Optional. PNG, JPEG, or WebP, 5 MB or less. Without an image, the card shows the first letter. |
| Title | Required, unique for each creator, 60 characters or less. |
| Chat name | Optional. Empty means the title. The AI uses this name. |
| Bio | Required. Markdown with the B, I, U, and link buttons. |
| Tags | Up to 10, from the tag list. |
| Personality | Required. Shows a token count. |
| Scenario | Optional. Shows a token count. |
| Initial messages | 1 to 10. Tabs, add, reorder, delete, and Write or Preview. |
| Example dialogs | Optional. Uses `{{char}}` and `{{user}}`. |

- The footer shows "Total: X tokens. Permanent: Y tokens." Permanent counts Chat name,
  Personality, and Scenario. The counts are estimates.
- There is no Pronoun Macros box.
- **Save draft** keeps a private draft. **Publish** saves and applies the Public setting.
- **Tavern PNG import:** the user picks a Character Card V2 or V3 PNG. The app reads the `chara` or
  `ccv3` text chunk, fills the form, and uses the image as the avatar.
- The card preview on the right changes as the user types.

### 4.5 Chat

- The character's profile sits at the top. Messages have round avatars. The user's messages are
  grey bubbles.
- Text in `*asterisks*` shows in italics as an action.
- The AI reply streams word by word. A Stop button ends the stream.
- **Regenerate** replaces the last AI reply with a new one. *(My call: no list of old versions.)*
- The user can edit or delete their own messages. An edit does not start a new AI reply.
- **Reply choices:** after each AI reply, four short replies in the user's voice show above the
  text box. A click sends that reply at once. "New choices" makes a new set.
- A **Reply choices** switch in the text box bar turns the choices on or off. The setting stays
  for each user.
- The text box is always there.
- A chat without an active proxy shows a link to the proxy settings.

### 4.6 Proxies (model settings)

- Each user adds proxies with: Name, Proxy URL, "Add /chat/completions", API key with Show or Hide,
  Model, and an optional Custom prompt.
- The user picks one active proxy. The sidebar model card shows its name and model.
- **Test** sends a small request and shows the result.
- After a save, the screen shows the key only as `••••3f9a`. The backend never sends a saved key
  back to the browser.
- A change applies at once. There is no "refresh the page" step.

### 4.7 Safe-for-work content

- Wanderer has no 18+ category. Paddle, the payment provider, does not allow adult content
  ([ADR 0005](../decisions/0005-no-adult-content.md)).
- The chat system prompt ends with a content rule: no sexual content, no nudity and no sexual
  roleplay. It comes after the user instructions and the memory.
- Each scene image asks for a safe image, and the image model uses its safety checker.
- The one-time command `delete-adult-characters` deleted the old 18+ characters.

### 4.8 Reports and admin

- Each character page has a **Report** button. The user picks a reason and can add a note of
  500 characters or less.
- Reasons: sexual content with minors, sexual content, hate or harassment, copied character,
  and other.
- A user can report one character only one time. A limit of 10 reports each day stops spam.
- The owner has the `admin` role. The admin page lists open reports. Reports about minors go to
  the top.
- From a report, the admin can hide the character, delete it, ban the creator, or close the report
  with no action.
- A banned user cannot log in. Their sessions end at once, and their public characters are hidden.
- `ADMIN_EMAILS` in the backend config names the admin accounts.

### 4.9 Account settings

- The Reply choices default and the handle.
- **Delete account** removes the user, their characters, chats, proxies, sessions, and uploads.
  Their reports stay for the admin, without the reporter's identity.

## 5. Architecture

```
Browser
  |-- https://wanderer.alienstro.xyz ------> Next.js (apps/web)
  |                                            | server render of public pages
  |                                            v
  `-- https://wanderer-api.alienstro.xyz --> NestJS (apps/api) ---> Postgres (Dokploy)
                                               |                `-> uploads volume
                                               `--> each user's proxy (OpenAI-compatible)
```

### 5.1 Repository

One repository with pnpm workspaces:

- `apps/web`: Next.js frontend.
- `apps/api`: NestJS backend.
- `packages/shared`: Zod schemas, shared types, the terms version, and the token estimate.

### 5.2 Who renders what

- The login cookie belongs to `wanderer-api.alienstro.xyz` only. The Next.js server cannot read it.
- **Public pages** (Discover for visitors, character pages, Terms, Privacy) render on the Next.js
  server. It calls the API with no cookie.
- **Pages that need a login** (chat, create, settings, admin, and Discover for a logged-in user)
  load their data in the browser with `credentials: "include"`. TanStack Query keeps the data.

### 5.3 Login flow

1. The frontend sends the user to `GET /auth/google?terms=<version>` on the API. The checkbox
   must be ticked first.
2. The API creates the OAuth `state` and a PKCE verifier, and keeps them and the terms version in
   a short, signed cookie.
3. Google sends the user back to `GET /auth/google/callback`. The API checks `state`, gets the
   Google profile, and creates or updates the user.
4. The API saves the terms acceptance and creates a session.
5. The API redirects to the frontend. New users go to the handle step.

Scopes: `openid`, `email`, and `profile` only. Google needs no app review for these scopes.

### 5.4 Sessions and CSRF

- The session cookie is `__Host-wanderer_session`: `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`, and no `Domain`. So it stays on the API host only.
- The cookie holds a random ID. Postgres keeps only a hash of the ID.
- A session lasts 30 days and renews on use. Logout, a ban, and account deletion remove it.
- Both hosts are on the same site (`alienstro.xyz`), so `SameSite` alone does not stop CSRF from
  other apps on that domain. The API accepts a request that changes data only when its `Origin`
  header is `https://wanderer.alienstro.xyz`, and only with a JSON body.
- CORS allows only that origin, with credentials.

## 6. Tech stack

Pin exact versions in the plan, from the current stable releases at build time.

| Part | Choice | Reason |
|---|---|---|
| Runtime | Node.js 24 LTS | The current long-term support version |
| Package manager | pnpm workspaces | Shared code between the apps without a publish step |
| Frontend | Next.js (App Router), React, TypeScript | The owner's choice |
| UI | Tailwind CSS and shadcn/ui | Accessible menus, dialogs, and tabs that live in the repo as code |
| Data in the browser | TanStack Query | Cache, retry, and loading states for API calls |
| Markdown | `react-markdown` with `rehype-sanitize` | No raw HTML, so no XSS from bios or messages |
| Backend | NestJS, TypeScript | The owner's choice |
| Validation | Zod schemas from `packages/shared` | One rule for both sides |
| Database | Postgres with Prisma | Typed queries and safe migrations |
| Login | Google OAuth 2.0 code flow with PKCE, sessions in Postgres | A ban or logout takes effect at once |
| AI client | `openai` SDK with a custom `baseURL` | One client for all OpenAI-compatible providers |
| Streaming | Server-Sent Events from the API | Simple, and works through Cloudflare |
| Images | `sharp` | Checks, resizes, and strips metadata from uploads |
| Limits | `@nestjs/throttler` | Stops spam on login, chat, and reports |
| Logs | `nestjs-pino` | JSON logs, with keys and chat text removed |
| Tests | Vitest, Supertest, and Playwright | Unit, API, and browser tests |
| Deploy | Docker images built by Dokploy from Git | One image for each app |

## 7. Data model

All IDs are UUIDs. All tables have `created_at`. The list shows the main fields only.

- **User:** `email` (unique), `google_sub` (unique), `name`, `picture_url`, `handle` (unique),
  `role` (`user` or `admin`), `show_adult`, `adult_confirmed_at`, `reply_choices_on`,
  `banned_at`, `active_proxy_id`.
- **Session:** `user_id`, `token_hash`, `expires_at`, `last_seen_at`.
- **TermsAcceptance:** `user_id`, `version`, `accepted_at`.
- **Character:** `creator_id`, `title`, `chat_name`, `bio`, `personality`, `scenario`,
  `example_dialogs`, `is_adult`, `is_public`, `definition_visible`, `status` (`draft`,
  `published`, `hidden`), `avatar_file_id`, `chat_count`. `chat_count` goes up by one for each
  new chat and does not go down when a chat is deleted. *(My call.)*
- **CharacterOpening:** `character_id`, `position`, `text`. One to ten for each character.
- **Tag** and **CharacterTag:** the tag list and the link to characters.
- **Chat:** `user_id`, `character_id`, `title`, `last_message_at`.
- **Message:** `chat_id`, `role` (`user` or `assistant`), `content`, `position`, `edited_at`.
- **Proxy:** `user_id`, `name`, `base_url`, `append_path`, `model`, `custom_prompt`,
  `key_ciphertext`, `key_iv`, `key_tag`, `key_version`, `key_last4`.
- **Report:** `character_id`, `reporter_id` (null after account deletion), `reason`, `note`,
  `status` (`open` or `closed`), `action`, `resolved_by`, `resolved_at`. Unique on
  `character_id` and `reporter_id`.
- **File:** `owner_id`, `path`, `mime`, `size`, `width`, `height`.

## 8. API outline

All paths are on `https://wanderer-api.alienstro.xyz`. Request and response bodies use the Zod
schemas from `packages/shared`.

| Area | Endpoints |
|---|---|
| Auth | `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /me` |
| Profile | `PATCH /me` (handle, settings), `DELETE /me` |
| Discover | `GET /characters?q=&tag=&sort=&cursor=`, `GET /characters/for-you`, `GET /tags` |
| Characters | `GET /characters/:id`, `POST /characters`, `PATCH /characters/:id`, `DELETE /characters/:id`, `POST /characters/import-png` |
| Files | `POST /files` (avatar upload), `GET /files/:id` |
| Chats | `GET /chats`, `POST /chats` (character and opening), `GET /chats/:id`, `DELETE /chats/:id` |
| Messages | `POST /chats/:id/messages` (SSE stream), `POST /chats/:id/regenerate` (SSE), `PATCH /messages/:id`, `DELETE /messages/:id`, `POST /chats/:id/choices` |
| Proxies | `GET /proxies`, `POST /proxies`, `PATCH /proxies/:id`, `DELETE /proxies/:id`, `POST /proxies/:id/test`, `POST /proxies/:id/activate` |
| Reports | `POST /characters/:id/report` |
| Admin | `GET /admin/reports`, `POST /admin/reports/:id/resolve`, `POST /admin/users/:id/ban` |

## 9. AI pipeline

### 9.1 Prompt for a reply

The API builds an OpenAI `messages` list in this order:

1. A `system` message: a short roleplay instruction, the proxy's Custom prompt, the Chat name,
   the Personality, the Scenario, and the Example dialogs.
2. The opening that the user picked, as an `assistant` message.
3. The chat history.

The API replaces `{{char}}` with the Chat name and `{{user}}` with the user's name.

### 9.2 Context budget

- The permanent part (item 1) always goes in.
- The newest messages go in until the estimate reaches 16,000 tokens. Older messages drop out.
- *(My call. A proxy setting for the context size can come later.)*

### 9.3 Streaming

- The API calls the proxy with `stream: true` and sends each piece to the browser as an SSE event.
- The API saves the reply when the stream ends. A Stop from the user saves the part that came.
- The API sends SSE comment lines every 15 seconds, so Cloudflare does not close a slow stream.
- Time limits: 30 seconds to the first piece, 3 minutes for the full reply. No redirects.

### 9.4 Reply choices

- After a reply, and only when the switch is on, the frontend calls `POST /chats/:id/choices`.
- The API makes a second, short call to the same proxy. It asks for four replies in the user's
  voice, as a JSON array of strings.
- When the result is not valid JSON or has no four items, the API tries one more time. Then the
  frontend hides the choices. The chat still works.

### 9.5 Errors

- The API changes provider errors into clear text: a wrong key, a wrong model, no credit at the
  provider, a rate limit, or a time-out.
- The error text never includes the key.

## 10. Security

- **API keys:** AES-256-GCM with a 32-byte key from `KEY_ENCRYPTION_KEY`. Each key has its own IV.
  `key_version` allows a key change later. The API decrypts a key only for a proxy call.
- **SSRF guard:** a proxy URL must use `https`. The API resolves the host name and refuses
  loopback, private, link-local, CGNAT, and cloud metadata addresses. It connects to the IP that it
  checked, so a DNS change between the check and the call cannot pass the guard.
- **Access rules:** each query for chats, messages, proxies, and drafts filters by the user ID of
  the session. A private character is visible only to its creator and the admin.
- **Uploads:** the API checks the real file type, refuses files over 5 MB, and stores a new WebP
  copy from `sharp` (600×800 for avatars) with no metadata. It never stores the original file.
- **Content:** Markdown renders without raw HTML. The frontend sends a strict
  Content-Security-Policy.
- **Rate limits:** login 10 each minute for each IP, messages 30 each minute for each user, and
  reports 10 each day for each user.
- **Logs:** no keys, no cookies, and no chat text.

## 11. Deploy

- Dokploy builds two apps from `github.com/alienstro/wanderer`, each from its own multi-stage
  Dockerfile.
- `apps/api` runs `prisma migrate deploy` before it starts.
- Postgres is a Dokploy service on the internal network. It has no public port.
- The uploads folder is a Dokploy volume mounted in the API container.
- **Cloudflare Zero Trust tunnel:** a `cloudflared` container on the server opens an outbound
  connection to Cloudflare. The tunnel has two public hostnames, `wanderer.alienstro.xyz` and
  `wanderer-api.alienstro.xyz`. Both go to Dokploy's Traefik on the server, which picks the app by
  host name.
- Cloudflare ends TLS. The traffic inside the tunnel is encrypted. So the Dokploy domains use
  `http`, with no Let's Encrypt certificate.
- The API must trust the `X-Forwarded-Proto` and `X-Forwarded-For` headers from the proxy
  (Express `trust proxy`). Without this setting, the API does not set `Secure` cookies, builds
  `http` redirect URLs for Google, and limits all users as one IP.
- Do not put a Cloudflare Access login in front of the two Wanderer hostnames. Public users must
  reach them. Use Access only for the admin tools, such as the Dokploy dashboard and SSH.
- **Backups:** Dokploy runs a daily Postgres backup to a Cloudflare R2 bucket, through R2's
  S3-compatible API. The uploads volume goes to the same bucket. Use an R2 API token that can
  write only to that bucket.
- Each app has a health check: `GET /health` on the API, and the home page on the web app.

Environment variables:

| App | Variables |
|---|---|
| api | `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `COOKIE_SECRET`, `KEY_ENCRYPTION_KEY`, `WEB_ORIGIN`, `ADMIN_EMAILS`, `UPLOAD_DIR` |
| web | `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` |

## 12. Decisions

### The owner decided

- Next.js for the frontend and NestJS for the backend.
- Dokploy on `root@main`, Postgres in Dokploy, and a Cloudflare Zero Trust tunnel for the two
  addresses.
- The private GitHub repository `alienstro/wanderer`.
- Cloudflare R2 for the backups.
- The API address `wanderer-api.alienstro.xyz`.
- A few free users, with no payments.
- Google as the only login.
- No 18+ category. All content is safe for work.
- The Terms and Privacy checkbox before the login.
- A Report button for users, and the owner as the admin.
- The approved prototype: its screens, its look, and its features.
- No other library choices. The builder chooses them.

### My calls (the owner can change these)

- Keys on the server with AES-256-GCM, and the SSRF guard.
- Reply choices from a second model call.
- pnpm workspaces, Prisma, Zod, TanStack Query, shadcn/ui, and the other choices in section 6.
- Sessions in Postgres instead of JWTs.
- Visitors can see public pages without a login.
- A handle step at the first login.
- Regenerate replaces the reply, with no list of old versions.
- A context budget of 16,000 tokens.
- The report reasons and limits.
- No notifications in version 1.
- An uploads volume instead of object storage. A storage interface makes a later move simple.

## 13. Left to the builder

- The exact package versions, pinned in the plan.
- The wording of the roleplay system instruction and the reply-choices instruction.
- The tag list. Start with the tags of the prototype.
- The design tokens. Copy them from the prototype: background `#0E0E10`, sidebar `#131316`,
  surfaces `#18181B` and `#1F1F23`, text `#F4F4F5`, accent `#632EFF`, logo gold `#F5C26B`,
  Inter for the UI, and Cinzel for the logo name only.
- Which seed characters go in the first database. The prototype images come from Pixabay and are
  for the prototype only.
