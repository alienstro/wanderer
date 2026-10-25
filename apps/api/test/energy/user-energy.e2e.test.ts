import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../../src/ai/ai-client.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { addProxy, postStream, startChat } from "../support/chat-stream.js";
import { testEnv, WEB_ORIGIN } from "../support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "../support/fake-ai-server.js";
import { addFreeModel, resetEnergySettings, SERVER_KEY } from "../support/free-models.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("energy and free models for users", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let user: TestUser;

  const get = (path: string) => request(app.getHttpServer()).get(path).set("Cookie", user.cookie);
  const post = (path: string) => request(app.getHttpServer()).post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie);

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({
      env: testEnv({ OPENROUTER_API_KEY: SERVER_KEY }),
      overrides: [{ token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) }],
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.freeModel.deleteMany();
    await resetEnergySettings(prisma);
    user = await userWithSession(app, 1);
  });

  afterAll(async () => {
    await prisma.freeModel.deleteMany();
    await app.close();
    await fake.close();
  });

  it("a new user sees 20 energy, the next refill, and the prices of the default free model", async () => {
    await addFreeModel(prisma, { isDefault: true });

    const res = await get("/energy").expect(200);

    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    expect(res.body).toEqual({
      balance: 20,
      dailyEnergy: 20,
      nextRefillAt: tomorrow.toISOString(),
      model: "free",
      freeModelName: "Gemma",
      prices: { reply: 0.34, choices: 0, memory: 1, scene: 0.3 },
    });
  });

  it("a user with an own model pays nothing for text, and the scene price stays", async () => {
    await addFreeModel(prisma, { isDefault: true });
    await addProxy(app, user);

    expect((await get("/energy").expect(200)).body).toMatchObject({
      model: "own",
      freeModelName: null,
      prices: { reply: 0, choices: 0, memory: 0, scene: 0.3 },
    });
  });

  it("lists the enabled free models with their prices, and marks the active one", async () => {
    const gemma = await addFreeModel(prisma, { isDefault: true });
    await addFreeModel(prisma, { openrouterId: "off/model:free", displayName: "Off", enabled: false });

    expect((await get("/free-models").expect(200)).body).toEqual([
      { id: gemma.id, displayName: "Gemma", energyPrice: 0.34, isDefault: true, isActive: true },
    ]);
  });

  it("a user picks a free model, and the next reply uses it instead of the own model", async () => {
    await addFreeModel(prisma, { isDefault: true });
    const llama = await addFreeModel(prisma, { openrouterId: "meta/llama:free", displayName: "Llama", manualEnergyPrice: 50 });
    await addProxy(app, user);

    const list = await post(`/free-models/${llama.id}/activate`).expect(200);

    expect(list.body.find((model: { isActive: boolean }) => model.isActive)).toMatchObject({ id: llama.id });
    const chatId = await startChat(app, user, await createCharacter(app, user.cookie));
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    expect(fake.requests.at(-1)?.body.model).toBe("meta/llama:free");
    expect((await get("/energy").expect(200)).body).toMatchObject({ balance: 19.5, model: "free" });
  });

  it("a model that is off cannot be picked", async () => {
    const off = await addFreeModel(prisma, { enabled: false });

    expect((await post(`/free-models/${off.id}/activate`).expect(404)).body).toEqual({ error: "not_found" });
  });

  it("no answer holds the server key", async () => {
    await addFreeModel(prisma, { isDefault: true });

    for (const path of ["/me", "/energy", "/free-models"]) {
      expect(JSON.stringify((await get(path).expect(200)).body)).not.toContain(SERVER_KEY);
    }
  });
});
