import { fileURLToPath } from "node:url";

// The e2e servers use their own ports and their own database, so a run does not touch dev data.
// An IPv4 address, not "localhost": "localhost" can go to ::1, where a different server can listen.
export const E2E_HOST = "127.0.0.1";
export const WEB_URL = `http://${E2E_HOST}:3200`;
export const API_URL = `http://${E2E_HOST}:3201`;
export const DATABASE_URL = "postgresql://wanderer:wanderer@localhost:5433/wanderer_e2e";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const TMP_DIR = fileURLToPath(new URL("../.tmp/", import.meta.url));
export const UPLOAD_DIR = `${TMP_DIR}uploads`;

/** The env of the e2e API server. The Google values are placeholders, because no test uses Google. */
export const apiServerEnv: Record<string, string> = {
  DATABASE_URL,
  GOOGLE_CLIENT_ID: "e2e-client-id",
  GOOGLE_CLIENT_SECRET: "e2e-client-secret",
  GOOGLE_CALLBACK_URL: `${API_URL}/auth/google/callback`,
  COOKIE_SECRET: "e2e-cookie-secret-with-32-or-more-characters",
  WEB_ORIGIN: WEB_URL,
  ADMIN_EMAILS: "admin@example.com",
  // A fixed test key: 32 bytes of 0x01. Never use it outside tests.
  KEY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  UPLOAD_DIR,
  PORT: "3201",
  LOG_LEVEL: "warn",
};

/** The env of the e2e web server. NEXT_PUBLIC_API_URL is set at build time by the build script. */
export const webServerEnv: Record<string, string> = {
  API_INTERNAL_URL: API_URL,
  NEXT_PUBLIC_API_URL: API_URL,
  PORT: "3200",
  HOSTNAME: E2E_HOST,
};
