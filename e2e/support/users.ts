import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { E2E_HOST, TMP_DIR } from "./env.js";

/** The cookie name of apps/api/src/auth/session-cookie.ts. */
export const SESSION_COOKIE = "__Host-wanderer_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface E2EUser {
  email: string;
  handle: string;
  name: string;
  role: "user" | "admin";
}

export interface E2EUserWithState extends E2EUser {
  /** The Playwright storage state file with the session cookie of this user. */
  storageState: string;
}

function withState(key: string, user: E2EUser): E2EUserWithState {
  return { ...user, storageState: `${TMP_DIR}${key}.json` };
}

export const E2E_USERS = {
  creator: withState("creator", { email: "creator@example.com", handle: "e2e_creator", name: "E2E Creator", role: "user" }),
  reader: withState("reader", { email: "reader@example.com", handle: "e2e_reader", name: "E2E Reader", role: "user" }),
  admin: withState("admin", { email: "admin@example.com", handle: "e2e_admin", name: "E2E Admin", role: "admin" }),
};

/**
 * Makes a user with a handle and one session, and gives the session token.
 * Google login cannot run in a test, so the row goes in directly, as the API makes it:
 * the database keeps only the SHA-256 hash of the token.
 */
export async function insertUserWithSession(client: pg.Client, user: E2EUser): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (id, email, google_sub, name, handle, role)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"Role") RETURNING id`,
    [user.email, `e2e-${user.handle}`, user.name, user.handle, user.role],
  );
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1, $2, $3)`,
    [rows[0]!.id, tokenHash, new Date(Date.now() + SESSION_LIFETIME_MS)],
  );
  return token;
}

/**
 * A Playwright storage state with the session cookie. A cookie for an IP address is host-only,
 * as the __Host- prefix needs. Cookies do not depend on the port, so the web and the API both get it.
 */
export function storageState(token: string) {
  return {
    cookies: [
      {
        name: SESSION_COOKIE,
        value: token,
        domain: E2E_HOST,
        path: "/",
        expires: Math.floor((Date.now() + SESSION_LIFETIME_MS) / 1000),
        httpOnly: true,
        secure: true,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}
