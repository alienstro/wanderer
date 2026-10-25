import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { addProxy, listen, parseEvents, postStream, startChat } from "./support/chat-stream.js";
import { testEnv, WEB_ORIGIN } from "./support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "./support/fake-ai-server.js";
import { addFreeModel, resetEnergySettings, SERVER_KEY } from "./support/free-models.js";
import { type TestUser, userWithSession } from "./support/users.js";

const FOUR = '["Yes", "No", "Maybe", "Run!"]';
/** The reply price of the test model: $0.00336 with a markup of 0% is 0.34 energy. */
const REPLY_PRICE = 34;

describe("energy spend on text actions", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let user: TestUser;
  let chatId: string;
  let baseUrl: string;

  const send = () => postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" });
  const post = (path: string) =>
    request(app.getHttpServer()).post(`/chats/${chatId}${path}`).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send({});
  const balance = async () => (await prisma.user.findUniqueOrThrow({ where: { id: user.user.id } })).energy;
  const entries = () =>
    prisma.energyEntry.findMany({ where: { userId: user.user.id }, orderBy: { createdAt: "asc" }, select: { amount: true, reason: true } });

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({
      env: testEnv({ OPENROUTER_API_KEY: SERVER_KEY }),
      overrides: [{ token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) }],
    });
    prisma = app.get(PrismaService);
    baseUrl = await listen(app);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.freeModel.deleteMany();
    await prisma.appEvent.deleteMany();
    await resetEnergySettings(prisma);
    await addFreeModel(prisma, { isDefault: true });
    user = await userWithSession(app, 1);
    chatId = await startChat(app, user, await createCharacter(app, user.cookie));
  });

  afterAll(async () => {
    await prisma.freeModel.deleteMany();
    await resetEnergySettings(prisma);
    await app.close();
    await fake.close();
  });

  it("a free reply takes the reply price", async () => {
    await send().expect(200);

    expect(await balance()).toBe(2000 - REPLY_PRICE);
    expect(await entries()).toEqual([
      { amount: 2000, reason: "refill" },
      { amount: -REPLY_PRICE, reason: "reply" },
    ]);
  });

  it("a reply on the user's own model takes nothing", async () => {
    await addProxy(app, user);

    await send().expect(200);

    expect(await entries()).toEqual([]);
  });

  it("a free reply that fails with no text gives the energy back", async () => {
    fake.next({ status: 500 });

    const res = await send().expect(200);

    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "error", error: "provider_error" });
    expect(await balance()).toBe(2000);
    expect((await entries()).map((entry) => entry.reason)).toEqual(["refill", "reply", "refund"]);
  });

  it("a Stop of the user before the first piece gives no refund, so a Stop loop cannot use the shared cap for free", async () => {
    fake.next({ pieces: ["Late"], firstDelayMs: 300 });
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, Cookie: user.cookie },
      body: JSON.stringify({ content: "Hi" }),
      signal: controller.signal,
    });
    // The first bytes are the start event. The Stop comes before any piece of the reply.
    await res.body!.getReader().read();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await balance()).toBe(2000 - REPLY_PRICE);
    expect((await entries()).map((entry) => entry.reason)).toEqual(["refill", "reply"]);
  });

  it("an OpenRouter 429 gives free_model_busy, a refund and an event", async () => {
    fake.next({ status: 429 });

    const res = await send().expect(200);

    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "error", error: "free_model_busy" });
    expect(await balance()).toBe(2000);
    expect(await prisma.appEvent.findMany({ where: { type: "free_model_busy" } })).toMatchObject([{ reason: "rate_limited" }]);
  });

  it("low energy gives 429 energy_low before a model call, and saves no message", async () => {
    await prisma.user.update({ where: { id: user.user.id }, data: { energy: 10, energyRefilledAt: new Date() } });
    const calls = fake.requests.length;

    const res = await send().expect(429);

    expect(JSON.parse(res.body as string)).toEqual({
      error: "energy_low",
      balance: 0.1,
      price: 0.34,
      nextRefillAt: expect.any(String),
    });
    expect(fake.requests.length).toBe(calls);
    expect(await prisma.message.count({ where: { chatId } })).toBe(1);
  });

  it("the daily cap stops free replies, but a user with an own model can still chat", async () => {
    await prisma.energySettings.update({ where: { id: 1 }, data: { freeDailyCap: 0 } });

    const res = await send().expect(503);

    expect(JSON.parse(res.body as string)).toEqual({ error: "free_model_busy" });
    expect(await prisma.appEvent.findMany({ where: { type: "free_model_busy" } })).toMatchObject([{ reason: "cap" }]);
    await addProxy(app, user);
    await send().expect(200);
  });

  it("choices with the switch off on a free model give 409 choices_off and take nothing", async () => {
    await prisma.user.update({ where: { id: user.user.id }, data: { replyChoicesOn: false } });
    const calls = fake.requests.length;

    expect((await post("/choices").expect(409)).body).toEqual({ error: "choices_off" });

    expect(fake.requests.length).toBe(calls);
    expect(await entries()).toEqual([]);
  });

  it("choices at a price of 0.5 from a balance of 100 leave 99.5", async () => {
    await prisma.energySettings.update({ where: { id: 1 }, data: { dailyEnergy: 10_000, choicesPrice: 50 } });
    fake.next({ pieces: [FOUR] });

    await post("/choices").expect(200);

    expect(await balance()).toBe(9950);
  });

  it("choices that fail give the energy back", async () => {
    await prisma.energySettings.update({ where: { id: 1 }, data: { choicesPrice: 50 } });
    fake.next({ pieces: ["bad"] }, { pieces: ["bad"] });

    await post("/choices").expect(502);

    expect(await balance()).toBe(2000);
  });

  it("a free memory draft takes the memory price", async () => {
    await prisma.message.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        chatId,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `m${index + 1} ${"x".repeat(3990)}`,
        position: index + 1,
      })),
    });
    fake.next({ pieces: ["Draft."] });

    await post("/memory/summarize").expect(200);

    expect(await balance()).toBe(2000 - 100);
  });
});
