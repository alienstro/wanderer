import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "./env.js";

const apiRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Vitest runs this one time before the tests. It applies the migrations to the test database.
 * Each test file deletes its own rows, so no destructive reset is necessary.
 */
export default function setup(): void {
  execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "ignore",
  });
}
