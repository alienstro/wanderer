import { loadEnv, type Env } from "../../src/config/env.js";

export const WEB_ORIGIN = "https://wanderer.alienstro.xyz";

export const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ?? "postgresql://wanderer:wanderer@localhost:5433/wanderer_test";

/** Returns a valid environment for tests. A test can replace single values. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    DATABASE_URL: testDatabaseUrl,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_CALLBACK_URL: "https://wanderer-api.alienstro.xyz/auth/google/callback",
    COOKIE_SECRET: "test-cookie-secret-with-32-or-more-characters",
    WEB_ORIGIN,
    ADMIN_EMAILS: " Admin@Example.com ,owner@example.com",
    LOG_LEVEL: "silent",
    // A fixed test key: 32 bytes of 0x01. Never use it outside tests.
    KEY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    ...overrides,
  });
}
