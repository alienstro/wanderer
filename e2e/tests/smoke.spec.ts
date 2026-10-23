import { expect, test } from "@playwright/test";
import { API_URL, WEB_URL } from "../support/env.js";
import { assertLocalDatabase } from "../support/local-db.js";
import { E2E_USERS } from "../support/users.js";

test("a visitor sees the landing page on / with no sidebar, and Discover on /discover", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Talk with characters. Write the story together." })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);

  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
});

test("the landing page has no horizontal scroll at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  // The e2e project has no DOM types, so the check goes to the browser as a string.
  const overflow = await page.evaluate<number>("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  expect(overflow).toBe(0);
  // The page clips the overflow, so also check that the header button is fully on the screen.
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in", exact: true })).toBeInViewport({ ratio: 1 });
});

test.describe("as the creator", () => {
  test.use({ storageState: E2E_USERS.creator.storageState });

  test("a logged-in user who opens / gets Discover and sees their handle in the sidebar", async ({ page }) => {
    // The first visit has no signed-in hint yet, so the browser check sends the user on.
    await page.goto("/");
    await expect(page).toHaveURL(/\/discover$/);
    // The Discover cards can show the handle too, so look only in the sidebar.
    await expect(page.getByRole("complementary").getByText("@e2e_creator")).toBeVisible();

    // Now the hint is set, so the server sends the user on before the landing page renders.
    const res = await page.request.get("/", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toMatch(/\/discover$/);
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
