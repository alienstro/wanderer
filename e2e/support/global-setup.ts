import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { DATABASE_URL, REPO_ROOT, UPLOAD_DIR } from "./env.js";
import { assertLocalDatabase, withDb } from "./local-db.js";
import { E2E_USERS, insertUserWithSession, storageState } from "./users.js";

/**
 * Playwright runs this one time before the tests. Each run starts from a clean database and a clean
 * uploads folder, so rows and files of an earlier run do not change the results.
 */
export default async function globalSetup(): Promise<void> {
  assertLocalDatabase(DATABASE_URL);
  execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: `${REPO_ROOT}apps/api`,
    env: { ...process.env, DATABASE_URL },
    stdio: "ignore",
  });
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  // This also makes the .tmp folder for the storage state files.
  mkdirSync(UPLOAD_DIR, { recursive: true });

  await withDb(async (client) => {
    // The other user tables refer to users, so CASCADE empties them too. The tags table stays.
    await client.query("TRUNCATE users CASCADE");
    for (const user of Object.values(E2E_USERS)) {
      const token = await insertUserWithSession(client, user);
      writeFileSync(user.storageState, JSON.stringify(storageState(token)));
    }
  });
}
