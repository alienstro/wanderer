import { expect, test } from "@playwright/test";
import { apiAs, createCharacter, postJson } from "../support/api.js";
import { withDb } from "../support/local-db.js";
import { E2E_USERS, insertUserWithSession, storageState } from "../support/users.js";

test.describe("energy", () => {
  test("the database reset keeps the energy settings, so GET /energy answers 200", async () => {
    const rows = await withDb(async (client) => (await client.query<{ id: number }>("SELECT id FROM energy_settings")).rows);
    expect(rows).toEqual([{ id: 1 }]);

    const api = await apiAs(E2E_USERS.reader);
    const res = await api.get("/energy");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ balance: expect.any(Number), dailyEnergy: expect.any(Number) });
    await api.dispose();
  });

  test('a scene with too little energy gives 429 energy_low, and the chat shows "Not enough energy"', async ({ browser }) => {
    const characterId = await createCharacter(E2E_USERS.creator, { title: "Scene Target" });
    const handle = "e2e_no_energy";
    const token = await withDb(async (client) => {
      const sessionToken = await insertUserWithSession(client, { email: "no-energy@example.com", handle, name: "E2E No Energy", role: "user" });
      // A daily energy of 0 makes each refill give 0, so the balance stays below the scene price.
      await client.query("UPDATE users SET daily_energy = 0 WHERE handle = $1", [handle]);
      return sessionToken;
    });

    const state = storageState(token);
    const api = await apiAs({ storageState: state });
    let chatId: string;
    try {
      // The proxy URL check uses no DNS, and the energy check comes before each model and image call.
      const key = await postJson<{ id: string }>(api, "/api-keys", { name: "E2E key", apiKey: "sk-e2e-fake-key" });
      await postJson(api, "/proxies", { name: "E2E model", baseUrl: "https://openrouter.ai/api/v1", model: "e2e/model", apiKeyId: key.id });
      const { chat } = await postJson<{ chat: { id: string } }>(api, "/chats", { characterId });
      chatId = chat.id;

      const res = await api.post(`/chats/${chatId}/scenes`);
      expect(res.status()).toBe(429);
      expect(await res.json()).toMatchObject({ error: "energy_low", balance: 0 });
    } finally {
      await api.dispose();
    }

    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await page.goto(`/chats/${chatId}`);
    await page.getByRole("button", { name: /Generate scene/ }).click();
    await expect(page.getByText("Not enough energy")).toBeVisible();
    await context.close();
  });
});
