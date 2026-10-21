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
- Health check: `GET /health` returns `{"status":"ok"}`.
- At each start, the image runs `prisma migrate deploy` before the server starts.
- Environment variables:

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

- Volume: in **Advanced → Volumes**, add a volume mount. Type: Volume. Name: `wanderer-uploads`.
  Mount path: `/data/uploads`. The avatar images live there.

**Caution:** without this volume, each new deploy deletes all avatar images, but the database
still points to them.

Plan 3 adds `KEY_ENCRYPTION_KEY`.

### Web

- Build type: Dockerfile. Dockerfile path: `apps/web/Dockerfile`. Build context: `.` (the root).
- Build argument: `NEXT_PUBLIC_API_URL=https://wanderer-api.alienstro.xyz`. Next.js puts this
  value into the browser code at build time, so a change needs a new build.
- Port: `3000`.
- Health check: `GET /` (the home page) returns 200.

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
6. Do a test restore to a new database one time, so that you know that the backups work.

## Check after the deploy

1. Open `https://wanderer.alienstro.xyz/login`.
2. Tick the Terms box, and log in with Google.
3. Expected: the handle step opens. Pick a handle. Expected: the home page opens.
4. In the browser developer tools, find the cookie `__Host-wanderer_session` on
   `wanderer-api.alienstro.xyz`. Expected: `HttpOnly`, `Secure`, `SameSite=Lax`, and no `Domain`.
