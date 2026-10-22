import { expect, test } from "@playwright/test";
import { apiAs, createCharacter } from "../support/api.js";
import { API_URL } from "../support/env.js";
import { withDb } from "../support/local-db.js";
import { E2E_USERS, insertUserWithSession, storageState } from "../support/users.js";

test.describe("reports and the admin page", () => {
  test("a reader reports a character, and the admin sees the report", async ({ browser }) => {
    const id = await createCharacter(E2E_USERS.creator, { title: "Report Target" });

    const reader = await browser.newContext({ storageState: E2E_USERS.reader.storageState });
    const page = await reader.newPage();
    await page.goto(`/characters/${id}`);
    await page.getByRole("button", { name: "Report" }).click();
    await page.getByRole("radio", { name: "Wrongly marked 18+" }).check();
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Thanks. The admin will look at it.")).toBeVisible();
    await reader.close();

    const admin = await browser.newContext({ storageState: E2E_USERS.admin.storageState });
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("article", { name: "Report about Report Target" })).toBeVisible();
    await admin.close();
  });

  test('the admin hides a reported character, and the reader then sees "Not found"', async ({ browser }) => {
    const id = await createCharacter(E2E_USERS.creator, { title: "Hide Target" });
    const readerApi = await apiAs(E2E_USERS.reader);
    expect((await readerApi.post(`/characters/${id}/report`, { data: { reason: "hate" } })).status()).toBe(201);
    await readerApi.dispose();

    const admin = await browser.newContext({ storageState: E2E_USERS.admin.storageState });
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin");
    const report = adminPage.getByRole("article", { name: "Report about Hide Target" });
    await report.getByRole("button", { name: "Hide" }).click();
    await expect(report).toHaveCount(0);
    await admin.close();

    const reader = await browser.newContext({ storageState: E2E_USERS.reader.storageState });
    const page = await reader.newPage();
    await page.goto(`/characters/${id}`);
    await expect(page.getByText("Not found")).toBeVisible();
    await reader.close();
  });

  test("a user who is not admin gets no admin page", async ({ browser }) => {
    const reader = await browser.newContext({ storageState: E2E_USERS.reader.storageState });
    const page = await reader.newPage();
    await page.goto("/admin");
    await expect(page.getByText("This page is for the admin.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await reader.close();
  });
});

test("a user deletes their account and lands on the login page", async ({ browser, playwright }) => {
  const token = await withDb((client) =>
    insertUserWithSession(client, { email: "leaver@example.com", handle: "e2e_leaver", name: "E2E Leaver", role: "user" }),
  );
  const state = storageState(token);
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  await page.goto("/settings");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();

  const api = await playwright.request.newContext({ storageState: state });
  expect((await api.get(`${API_URL}/me`)).status()).toBe(401);
  await api.dispose();
});
