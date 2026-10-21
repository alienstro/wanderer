import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { REPLY_TIMING } from "../src/chats/reply.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { addProxy, listen, openStream, parseEvents, postStream, startChat, waitFor } from "./support/chat-stream.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "./support/fake-ai-server.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("streamed replies", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let baseUrl: string;
  let user: TestUser;
  let chatId: string;

  const sendPath = () => `/chats/${chatId}/messages`;
  const messages = () => prisma.message.findMany({ where: { chatId }, orderBy: { position: "asc" } });

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({
      overrides: [
        { token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) },
        { token: REPLY_TIMING, useValue: { firstPieceMs: 300, totalMs: 1_000, heartbeatMs: 50 } },
      ],
    });
    prisma = app.get(PrismaService);
    baseUrl = await listen(app);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    user = await userWithSession(app, 1);
    const characterId = await createCharacter(app, user.cookie, { title: "Onnit", openings: ["*waves* Hi!"] });
    chatId = await startChat(app, user, characterId);
    await addProxy(app, user);
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("a send gives start with the user message, the deltas in order, and done with the saved reply", async () => {
    fake.next({ pieces: ["Hel", "lo", " there"] });
    const res = await postStream(app, user, sendPath(), { content: "Hi Onnit" }).expect(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = parseEvents(res.body as string);
    expect(events[0]).toMatchObject({ type: "start", userMessage: { role: "user", content: "Hi Onnit", position: 1 } });
    expect(events.filter((e) => e.type === "delta").map((e) => (e.type === "delta" ? e.text : ""))).toEqual([
      "Hel",
      "lo",
      " there",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", message: { role: "assistant", content: "Hello there", position: 2 } });
    expect((await messages()).map((m) => m.content)).toEqual(["*waves* Hi!", "Hi Onnit", "Hello there"]);
  });

  it("the proxy request has the system prompt, the opening, and the history in order", async () => {
    await postStream(app, user, sendPath(), { content: "Hi Onnit" }).expect(200);
    const sent = fake.requests.at(-1)!.body;
    expect(sent.stream).toBe(true);
    expect(sent.messages?.map((m) => m.role)).toEqual(["system", "assistant", "user"]);
    expect(sent.messages?.[0]?.content).toContain("You are Onnit in a roleplay with User 1.");
    expect(sent.messages?.slice(1).map((m) => m.content)).toEqual(["*waves* Hi!", "Hi Onnit"]);
  });

  it("a send with no active proxy gives 409 JSON no_active_proxy and saves no message", async () => {
    await prisma.proxy.deleteMany();
    const res = await postStream(app, user, sendPath(), { content: "Hi" }).expect(409);
    expect(JSON.parse(res.body as string)).toEqual({ error: "no_active_proxy" });
    expect(await messages()).toHaveLength(1);
  });

  it("a 401 from the proxy gives an error event invalid_key with message null, and the user message stays", async () => {
    fake.next({ status: 401 });
    const res = await postStream(app, user, sendPath(), { content: "Hi" }).expect(200);
    expect(parseEvents(res.body as string).at(-1)).toEqual({ type: "error", error: "invalid_key", message: null });
    expect((await messages()).map((m) => m.role)).toEqual(["assistant", "user"]);
  });

  it("a slow first piece gives an error event timeout", async () => {
    fake.next({ pieces: ["late"], firstDelayMs: 600 });
    const res = await postStream(app, user, sendPath(), { content: "Hi" }).expect(200);
    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "error", error: "timeout" });
  });

  it('a slow stream gets ": ping" lines', async () => {
    fake.next({ pieces: ["a", "b", "c"], delayMs: 120 });
    const res = await postStream(app, user, sendPath(), { content: "Hi" }).expect(200);
    expect(res.body as string).toContain(": ping\n\n");
    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "done", message: { content: "abc" } });
  });

  it("a client abort after two pieces saves those two pieces as the reply", async () => {
    fake.next({ pieces: ["One ", "two ", "three"], delayMs: 150 });
    await openStream(baseUrl, user, sendPath(), { content: "Hi" }, 2);
    await waitFor(async () => (await messages()).length === 3);
    expect((await messages()).at(-1)).toMatchObject({ role: "assistant", content: "One two " });
  });

  it("a second send while a stream runs gives 409 chat_busy, and a send after an error works", async () => {
    fake.next({ pieces: ["a", "b", "c", "d"], delayMs: 100 });
    const first = openStream(baseUrl, user, sendPath(), { content: "First" });
    await waitFor(async () => fake.requests.length > 0 && (await messages()).length === 2);
    const busy = await postStream(app, user, sendPath(), { content: "Second" }).expect(409);
    expect(JSON.parse(busy.body as string)).toEqual({ error: "chat_busy" });
    await first;
    fake.next({ status: 500 });
    const failed = await postStream(app, user, sendPath(), { content: "Third" }).expect(200);
    expect(parseEvents(failed.body as string).at(-1)).toMatchObject({ type: "error", error: "provider_error" });
    const ok = await postStream(app, user, sendPath(), { content: "Fourth" }).expect(200);
    expect(parseEvents(ok.body as string).at(-1)).toMatchObject({ type: "done" });
  });

  it("another user gets 404 for a send", async () => {
    const other = await userWithSession(app, 2);
    await addProxy(app, other);
    await postStream(app, other, sendPath(), { content: "Hi" }).expect(404);
    expect(await messages()).toHaveLength(1);
  });

  it("a send at once after a client abort never gives a 500", async () => {
    for (let round = 0; round < 10; round++) {
      fake.next({ pieces: ["One ", "two ", "three"], delayMs: 40 }, { pieces: ["Next"] });
      await openStream(baseUrl, user, sendPath(), { content: `Stop ${round}` }, 1);
      const res = await postStream(app, user, sendPath(), { content: `Again ${round}` });
      expect([200, 409]).toContain(res.status);
      // Let the first stream end before the next round.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  });

  it("another user gets 404, not 409, while the owner's stream runs", async () => {
    const other = await userWithSession(app, 2);
    await addProxy(app, other);
    fake.next({ pieces: ["a", "b", "c", "d"], delayMs: 100 });
    const first = openStream(baseUrl, user, sendPath(), { content: "Mine" });
    await waitFor(async () => (await messages()).length === 2);
    await postStream(app, other, sendPath(), { content: "Theirs" }).expect(404);
    await first;
  });
});
