import { expect, test } from "@playwright/test";
import { createCharacter } from "../support/api.js";
import { E2E_USERS } from "../support/users.js";

test.describe("as the creator", () => {
  test.use({ storageState: E2E_USERS.creator.storageState });

  test("the creator makes a public character and finds it in My characters", async ({ page }) => {
    await page.goto("/create");
    await page.getByLabel("Title").fill("Mira the Smith");
    await page.getByLabel("Bio").fill("A smith in a quiet town.");
    await page.getByRole("button", { name: "Fantasy" }).click();
    await page.getByLabel("Personality").fill("Direct and warm.");
    await page.getByLabel("Message 1 text").fill("*Mira puts down the hammer.* Welcome.");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mira the Smith" })).toBeVisible();

    await page.goto("/my-characters");
    await expect(page.getByText("Mira the Smith")).toBeVisible();
  });

  test("the creator edits the title and the character page shows the new title", async ({ page }) => {
    const id = await createCharacter(E2E_USERS.creator, { title: "Old Title" });
    await page.goto(`/characters/${id}/edit`);
    await page.getByLabel("Title").fill("New Title");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.goto(`/characters/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "New Title" })).toBeVisible();
  });
});

test.describe("as the reader", () => {
  test.use({ storageState: E2E_USERS.reader.storageState });

  test("another user opens the character and starts a chat", async ({ page }) => {
    const id = await createCharacter(E2E_USERS.creator, { title: "Bram", opening: "Bram waves from the gate." });
    await page.goto(`/characters/${id}`);
    await page.getByRole("button", { name: "Start a new chat" }).click();
    await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+$/);
    await expect(page.getByText("Bram waves from the gate.")).toBeVisible();
  });

  test('a user without "Show 18+" sees the 18+ warning, not the definition', async ({ page }) => {
    const id = await createCharacter(E2E_USERS.creator, { title: "Night Club", isAdult: true });
    await page.goto(`/characters/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "This character is 18+." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Definition" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Night Club" })).toHaveCount(0);
  });
});
