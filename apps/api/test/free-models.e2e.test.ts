import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { OPENROUTER_CHAT_URL } from "../src/free-models/free-models.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { parseEvents, postStream, startChat } from "./support/chat-stream.js";
import { testEnv } from "./support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "./support/fake-ai-server.js";
import { addFreeModel, resetEnergySettings, SERVER_KEY } from "./support/free-models.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("free models", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  const clients = { factory: new UnguardedAiClientFactory() };
  let user: TestUser;
  let chatId: string;

  const send = () => postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" });

  beforeAll(async () => {
    fake = await startFakeAiServer();
    clients.factory = new UnguardedAiClientFactory(fake.url);
    app = await createTestApp({
      env: testEnv({ OPENROUTER_API_KEY: SERVER_KEY }),
      overrides: [{ token: AI_CLIENT_FACTORY, useValue: clients.factory }],
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.freeModel.deleteMany();
    await resetEnergySettings(prisma);
    clients.factory.targets.length = 0;
    user = await userWithSession(app, 1);
    chatId = await startChat(app, user, await createCharacter(app, user.cookie));
  });

  afterAll(async () => {
    await prisma.freeModel.deleteMany();
    await app.close();
    await fake.close();
  });

  it("a new user with no model gets a reply from the default free model with the server key", async () => {
    await addFreeModel(prisma, { isDefault: true });
    fake.next({ pieces: ["Hello"] });

    const res = await send().expect(200);

    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "done", message: { content: "Hello" } });
    expect(clients.factory.targets).toEqual([
      { endpoint: OPENROUTER_CHAT_URL, apiKey: SERVER_KEY, model: "google/gemma-4-31b-it:free" },
    ]);
  });

  it("a user who picked a model that is now off uses the default model", async () => {
    await addFreeModel(prisma, { isDefault: true });
    const picked = await addFreeModel(prisma, { openrouterId: "meta/llama:free", displayName: "Llama", enabled: false });
    await prisma.user.update({ where: { id: user.user.id }, data: { freeModelId: picked.id } });

    await send().expect(200);

    expect(clients.factory.targets.map((target) => target.model)).toEqual(["google/gemma-4-31b-it:free"]);
  });

  it("a user who picked an enabled model uses it", async () => {
    await addFreeModel(prisma, { isDefault: true });
    const picked = await addFreeModel(prisma, { openrouterId: "meta/llama:free", displayName: "Llama" });
    await prisma.user.update({ where: { id: user.user.id }, data: { freeModelId: picked.id } });

    await send().expect(200);

    expect(clients.factory.targets.map((target) => target.model)).toEqual(["meta/llama:free"]);
  });

  it("a model with no price is not used", async () => {
    await addFreeModel(prisma, { isDefault: true, promptPriceUsd: null, completionPriceUsd: null });

    const res = await send().expect(409);

    expect(JSON.parse(res.body as string)).toEqual({ error: "no_active_proxy" });
  });
});

describe("free models with no server key", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.freeModel.deleteMany();
    await app.close();
  });

  it("a new user gets 409 no_active_proxy, as before", async () => {
    await prisma.user.deleteMany();
    await prisma.freeModel.deleteMany();
    await addFreeModel(prisma, { isDefault: true });
    const user = await userWithSession(app, 1);
    const chatId = await startChat(app, user, await createCharacter(app, user.cookie));

    const res = await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(409);

    expect(JSON.parse(res.body as string)).toEqual({ error: "no_active_proxy" });
  });
});
