import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { DATABASE_URL, REPO_ROOT, UPLOAD_DIR } from "./env.js";
import { assertLocalDatabase, withDb } from "./local-db.js";

// The e2e script runs this before `playwright test`. Playwright starts the servers before its
// global setup, so the migrations must run here, before the API connects. Each run then starts
// from a clean database and a clean uploads folder.
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
});
