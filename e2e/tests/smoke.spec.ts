import { expect, test } from "@playwright/test";
import { API_URL, WEB_URL } from "../support/env.js";
import { assertLocalDatabase } from "../support/local-db.js";
import { E2E_USERS } from "../support/users.js";

test("a visitor sees Discover and a Log in link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
});

test.describe("as the creator", () => {
  test.use({ storageState: E2E_USERS.creator.storageState });

  test("a logged-in user sees their handle in the sidebar", async ({ page }) => {
    await page.goto("/");
    // The Discover cards can show the handle too, so look only in the sidebar.
    await expect(page.getByRole("complementary").getByText("@e2e_creator")).toBeVisible();
  });
});

test('the API and the web health routes answer {"status":"ok"}', async ({ request }) => {
  for (const url of [`${API_URL}/health`, `${API_URL}/health/ready`, `${WEB_URL}/health`]) {
    const res = await request.get(url);
    expect(res.status(), url).toBe(200);
    expect(await res.json(), url).toEqual({ status: "ok" });
  }
});

test("assertLocalDatabase refuses a remote host", () => {
  expect(() => assertLocalDatabase("postgresql://u:p@db.example.com:5432/x")).toThrow(/db\.example\.com/);
  expect(() => assertLocalDatabase("postgresql://u:p@localhost:5433/x")).not.toThrow();
});
