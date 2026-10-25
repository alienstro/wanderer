import { expect, test } from "@playwright/test";
import { createCharacter } from "../support/api.js";
import { E2E_USERS } from "../support/users.js";

test.describe("personas", () => {
  test.use({ storageState: E2E_USERS.reader.storageState });

  test("a user adds a persona and a new chat shows it in the header", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Add persona" }).click();
    const dialog = page.getByRole("dialog", { name: "Add persona" });
    await dialog.getByLabel("Name").fill("Aria");
    await dialog.getByLabel("Description").fill("A knight with a scar.");
    await dialog.getByRole("button", { name: "Save" }).click();
    const aria = page.getByRole("listitem", { name: "Aria" });
    await expect(aria.getByText("Default")).toBeVisible();

    const id = await createCharacter(E2E_USERS.creator, { title: "Sela", opening: "Sela opens the door of the inn." });
    await page.goto(`/characters/${id}`);
    await page.getByRole("button", { name: "Start a new chat" }).click();
    await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+$/);
    await expect(page.locator("header").getByText("You play as")).toContainText("You play as Aria");
  });
});
