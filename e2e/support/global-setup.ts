import { writeFileSync } from "node:fs";
import { withDb } from "./local-db.js";
import { E2E_USERS, insertUserWithSession, storageState } from "./users.js";

/** Playwright runs this one time before the tests, after prepare-db.ts. It makes the test users and their sessions. */
export default async function globalSetup(): Promise<void> {
  await withDb(async (client) => {
    for (const user of Object.values(E2E_USERS)) {
      const token = await insertUserWithSession(client, user);
      writeFileSync(user.storageState, JSON.stringify(storageState(token)));
    }
  });
}
