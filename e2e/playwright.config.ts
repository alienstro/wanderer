import { defineConfig, devices } from "@playwright/test";
import { API_URL, apiServerEnv, REPO_ROOT, WEB_URL, webServerEnv } from "./support/env.js";

// One worker and Chromium only, so that a run on an 8 GB laptop stays light.
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  globalSetup: "./support/global-setup.ts",
  use: { baseURL: WEB_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      cwd: REPO_ROOT,
      url: `${API_URL}/health`,
      env: apiServerEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node e2e/support/start-web.mjs",
      cwd: REPO_ROOT,
      url: `${WEB_URL}/health`,
      env: webServerEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
