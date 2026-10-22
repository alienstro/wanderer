# Deploy Wanderer

This runbook is for the first deploy of Wanderer on a server with Dokploy. The owner does these
steps, because they need the Google and Cloudflare secrets.

The result:

- `https://wanderer.alienstro.xyz`: the web app (`apps/web`).
- `https://wanderer-api.alienstro.xyz`: the API (`apps/api`).
- Cloudflare ends TLS. A Cloudflare tunnel sends the traffic to Dokploy's Traefik. Traefik sends it
  to the app by host name.

## 1. Google OAuth client

1. Open Google Cloud Console, then **APIs & Services → OAuth consent screen**.
2. Set the app name to `Wanderer`. Set the home page to `https://wanderer.alienstro.xyz`.
3. Set the privacy policy link to `https://wanderer.alienstro.xyz/privacy` and the terms link to
   `https://wanderer.alienstro.xyz/terms`.
4. Add only the scopes `openid`, `email`, and `profile`. These scopes need no Google app review.
5. Open **Credentials → Create credentials → OAuth client ID**. Select **Web application**.
6. Add this authorized redirect URI:
   `https://wanderer-api.alienstro.xyz/auth/google/callback`
7. Keep the client ID and the client secret for step 3.

## 2. Postgres

1. In Dokploy, add a **Postgres** database service. Use the image `postgres:17`.
2. Do not give it a public port. The API reaches it on the Dokploy internal network.
3. Keep the internal connection URL for `DATABASE_URL` in step 3.

## 3. The two Dokploy apps

Make two applications from the GitHub repository `alienstro/wanderer`, branch `main`. Both build
from the repository root with their own Dockerfile.

### API

- Build type: Dockerfile. Dockerfile path: `apps/api/Dockerfile`. Build context: `.` (the root).
- Port: `3001`.
- Health checks:
  - `GET /health` returns `{"status":"ok"}` when the process answers. It does not call Postgres.
    The Dockerfile `HEALTHCHECK` uses it, so Docker restarts the API only when the process hangs.
  - `GET /health/ready` also runs `SELECT 1` on Postgres. It returns 503 and
    `{"status":"unavailable"}` when Postgres does not answer. The uptime monitor uses it (section 8).
- At each start, the image runs `prisma migrate deploy` before the server starts.
- Environment variables:

**Caution:** `KEY_ENCRYPTION_KEY` encrypts the API keys of all users. If you lose or change it, no
saved API key decrypts, and each user must enter their keys again. The Postgres backup does not hold
this value. Keep a copy in a password manager.

| Variable | Value |
|---|---|
| `DATABASE_URL` | The internal Postgres URL from step 2 |
| `GOOGLE_CLIENT_ID` | From step 1 |
| `GOOGLE_CLIENT_SECRET` | From step 1 |
| `GOOGLE_CALLBACK_URL` | `https://wanderer-api.alienstro.xyz/auth/google/callback` |
| `COOKIE_SECRET` | A random value with 32 or more characters, for example from `openssl rand -base64 48` |
| `WEB_ORIGIN` | `https://wanderer.alienstro.xyz` |
| `ADMIN_EMAILS` | The owner's Google email. Use commas between more than one address. |
| `UPLOAD_DIR` | `/data/uploads` (the image sets this value too) |
| `KEY_ENCRYPTION_KEY` | The base64 text of 32 random bytes, from `openssl rand -base64 32` |

- Volume: in **Advanced → Volumes**, add a volume mount. Type: Volume. Name: `wanderer-uploads`.
  Mount path: `/data/uploads`. The avatar images live there.

**Caution:** without this volume, each new deploy deletes all avatar images, but the database
still points to them.

### Web

- Build type: Dockerfile. Dockerfile path: `apps/web/Dockerfile`. Build context: `.` (the root).
- Build argument: `NEXT_PUBLIC_API_URL=https://wanderer-api.alienstro.xyz`. Next.js puts this
  value into the browser code at build time, so a change needs a new build.
- Port: `3000`.
- Health check: `GET /health` returns `{"status":"ok"}`. It does not call the API, so an API fault
  does not make Docker restart the web app. The Dockerfile `HEALTHCHECK` uses it.

- Environment variable: `API_INTERNAL_URL`. The Next.js server uses it for the pages that render on
  the server (Discover and the character pages). Use the internal address of the API app on the
  Dokploy network, for example `http://<api-app-name>:3001`. Dokploy shows the app name on the
  API app page. When this value is not set, the server uses `NEXT_PUBLIC_API_URL`, which goes out
  through Cloudflare and back.

## 4. Dokploy domains

1. Give the web app the domain `wanderer.alienstro.xyz`, and the API the domain
   `wanderer-api.alienstro.xyz`.
2. Set both domains to `http`. Do not turn on Let's Encrypt. Cloudflare ends TLS, and the traffic
   inside the tunnel is encrypted.

## 5. Cloudflare Zero Trust tunnel

1. In Cloudflare Zero Trust, open **Networks → Tunnels** and create a tunnel.
2. Run the `cloudflared` container on the server with the tunnel token. Put it on the Dokploy
   network, so that it can reach Traefik.
3. Add two public hostnames. Both go to Traefik:
   - `wanderer.alienstro.xyz` → `http://dokploy-traefik:80`
   - `wanderer-api.alienstro.xyz` → `http://dokploy-traefik:80`

**Warning:** the API counts the login limit for each client by the `CF-Connecting-IP` header.
Cloudflare sets this header. A client that reaches Traefik without the tunnel can set the header
itself and avoid the limit. Do step 4 of this section.

4. Close the public ports 80 and 443 on the server firewall. Only the tunnel must reach Traefik.
   Keep SSH open only for the admin, or put it behind Cloudflare Access.
5. Open `https://wanderer-api.alienstro.xyz/health`. Expected: `{"status":"ok"}`.

## 6. No Cloudflare Access on the app hostnames

Do not put a Cloudflare Access login in front of `wanderer.alienstro.xyz` or
`wanderer-api.alienstro.xyz`. Public users must reach them, and Google must reach the callback.
Use Access only for the admin tools, such as the Dokploy dashboard and SSH.

## 7. Backups to Cloudflare R2

1. In Cloudflare, make an R2 bucket, for example `wanderer-backups`.
2. Make an R2 API token with **Object Read & Write** for that bucket only.
3. In Dokploy, add an S3 destination with the R2 endpoint, the bucket, and the token.
4. Turn on a daily backup of the Postgres service to that destination.
5. In the API app, open **Volume Backups**. Add a daily backup of the `wanderer-uploads` volume to
   the same destination.
6. In both backups, set **Keep the latest** to `14`. Dokploy then deletes the backups that are
   older than two weeks.
7. In Cloudflare, open the bucket, then **Settings → Object lifecycle rules**. Add a rule that
   deletes objects older than 30 days. This is a second limit, if a Dokploy setting changes.

**Caution:** a backup that you never restored is not a known good backup. Do the restore drill
before the launch, and then one time each month.

### Restore drill

1. In Dokploy, make a new Postgres service with the name `wanderer-restore-test`.
2. In the backups of the main Postgres service, pick the newest backup and click **Restore**. Choose
   `wanderer-restore-test` as the target.
3. Open a terminal in `wanderer-restore-test` and run:
   `psql -U <user> -d <database> -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM characters) AS characters;"`
   Expected: the counts are near the counts of the main database.
4. Delete the `wanderer-restore-test` service.

## 8. Uptime monitor

Add an external uptime monitor, for example the free plan of a hosted monitor, with an email alert.
Check these two URLs each 5 minutes:

- `https://wanderer-api.alienstro.xyz/health/ready`. It fails when the API or Postgres fails.
- `https://wanderer.alienstro.xyz/health`. It fails when the web app fails.

## First launch checklist

Do the steps in this order. Each step needs the step before it.

1. Make the secrets: the Google client (section 1), `COOKIE_SECRET`, and `KEY_ENCRYPTION_KEY`. Keep a
   copy of `KEY_ENCRYPTION_KEY` in a password manager.
2. Make the Postgres service (section 2).
3. Deploy the API (section 3). Expected: the Dokploy container status is `healthy`.
4. Deploy the web app (section 3). Expected: the Dokploy container status is `healthy`.
5. Add the domains (section 4) and the tunnel (section 5).
6. Turn on the backups (section 7), and do the restore drill one time.
7. Add the uptime monitor (section 8).
8. On your computer, in the repository, run `pnpm smoke`. Expected: five lines with `200`, and exit
   code 0.
9. Do the checks in "Check after the deploy".
10. Make the first characters in the Create page. Use only images that you have the right to use.

## Check after the deploy

Run `pnpm smoke` first. It checks the health routes, the login page, and the home page.

1. Open `https://wanderer.alienstro.xyz/login`.
2. Tick the Terms box, and log in with Google.
3. Expected: the handle step opens. Pick a handle. Expected: the home page opens.
4. In the browser developer tools, find the cookie `__Host-wanderer_session` on
   `wanderer-api.alienstro.xyz`. Expected: `HttpOnly`, `Secure`, `SameSite=Lax`, and no `Domain`.
5. Click the model card at the foot of the sidebar (**Add a model**). Add a proxy with a real API
   key, then click **Test**.
   Expected: "The proxy answered" with the time.
6. Open a character, pick an opening, and click **Start a new chat**. Send a message.
   Expected: the reply streams in word by word, and four reply choices show above the text box.

## Run locally

`pnpm dev` starts the API on `http://localhost:3001` and the web app on `http://localhost:3100`.
The API restarts when a file in `apps/api/src` changes.

1. Start the local Postgres: `docker compose -f docker-compose.dev.yml up -d`.
2. Copy `apps/api/.env.docker.example` to `apps/api/.env`, and fill in the values.
   Change `host.docker.internal` to `localhost` in `DATABASE_URL`.
   Set `WEB_ORIGIN=http://localhost:3100` and `GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback`.
3. Copy `apps/web/.env.local.example` to `apps/web/.env.local`.
4. Apply the migrations: `pnpm --filter @wanderer/api exec prisma migrate deploy`.
5. Optional: add the sample data with `pnpm --filter @wanderer/api seed:dev`.
6. Run `pnpm dev`.

**Note:** The API does not watch `packages/shared`. After a change there, run
`pnpm --filter @wanderer/shared build`, then start `pnpm dev` again.

## End-to-end tests

The Playwright tests run the built API and the built web app on this computer, against a separate
database (`wanderer_e2e`). They do not touch production.

1. Start the local Postgres: `docker compose -f docker-compose.dev.yml up -d`.
2. Run `pnpm e2e`. It builds the API and the web app, then runs the tests with one worker.
3. To run the tests again without a new build, run `pnpm --filter @wanderer/e2e e2e`.

**Note:** `pnpm e2e` builds the web app for `http://127.0.0.1:3201`. Before a local
`next start` for development, build the web app again.
