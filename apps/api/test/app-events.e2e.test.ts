import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { MODEL_LIST_CLIENT } from "../src/ai/model-list.js";
import { AuthService } from "../src/auth/auth.service.js";
import { REPLY_TIMING } from "../src/chats/reply.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { addProxy, listen, openStream, postStream, startChat, waitFor } from "./support/chat-stream.js";
import { WEB_ORIGIN } from "./support/env.js";
import {
  type FakeAiServer,
  startFakeAiServer,
  UnguardedAiClientFactory,
  UnguardedModelListClient,
} from "./support/fake-ai-server.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("app events", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let baseUrl: string;
  let user: TestUser;
  let characterId: string;
  let chatId: string;

  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer()).post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const events = () =>
    prisma.appEvent.findMany({ select: { type: true, userId: true, characterId: true, reason: true }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({
      overrides: [
        { token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) },
        { token: MODEL_LIST_CLIENT, useValue: new UnguardedModelListClient(fake.url) },
        { token: REPLY_TIMING, useValue: { firstPieceMs: 300, totalMs: 1_000, heartbeatMs: 50 } },
      ],
    });
    prisma = app.get(PrismaService);
    baseUrl = await listen(app);
  });

  beforeEach(async () => {
    await prisma.appEvent.deleteMany();
    await prisma.user.deleteMany();
    user = await userWithSession(app, 1);
    characterId = await createCharacter(app, user.cookie);
    chatId = await startChat(app, user, characterId);
    await addProxy(app, user);
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("a failed reply records ai_reply_failed with the user and the character", async () => {
    fake.next({ status: 500 });
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    expect(await events()).toEqual([
      { type: "ai_reply_failed", userId: user.user.id, characterId, reason: "provider_error" },
    ]);
  });

  it("a reply time limit records timeout", async () => {
    fake.next({ pieces: ["late"], firstDelayMs: 600 });
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    expect(await events()).toEqual([{ type: "ai_reply_failed", userId: user.user.id, characterId, reason: "timeout" }]);
  });

  it("a Stop of the user records no event", async () => {
    fake.next({ pieces: ["a", "b", "c", "d"], delayMs: 100 });
    await openStream(baseUrl, user, `/chats/${chatId}/messages`, { content: "Hi" }, 1);
    await waitFor(async () => (await prisma.message.count({ where: { chatId, role: "assistant" } })) === 2);
    expect(await events()).toEqual([]);
  });

  it("failed choices record choices_failed with the code, and bad answers record bad_choices", async () => {
    fake.next({ status: 401 });
    await post(`/chats/${chatId}/choices`).expect(502);
    fake.next({ pieces: ["no list"] }, { pieces: ["still no list"] });
    await post(`/chats/${chatId}/choices`).expect(502);
    expect(await events()).toEqual([
      { type: "choices_failed", userId: user.user.id, characterId, reason: "invalid_key" },
      { type: "choices_failed", userId: user.user.id, characterId, reason: "bad_choices" },
    ]);
  });

  it("a failed summary records summary_failed", async () => {
    await prisma.message.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        chatId,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `m${index + 1} ${"x".repeat(3990)}`,
        position: index + 1,
      })),
    });
    fake.next({ status: 401 });
    await post(`/chats/${chatId}/memory/summarize`).expect(502);
    expect(await events()).toEqual([{ type: "summary_failed", userId: user.user.id, characterId, reason: "invalid_key" }]);
  });

  it("a failed proxy test and a failed model list record their codes with no character", async () => {
    const proxy = await prisma.proxy.findFirstOrThrow({ where: { userId: user.user.id } });
    fake.next({ status: 401 });
    await post(`/proxies/${proxy.id}/test`).expect(200);
    fake.next({ status: 401 });
    await post("/proxies/models", { baseUrl: "https://api.example.com/v1", apiKey: "sk-test-3f9a" }).expect(200);
    expect(await events()).toEqual([
      { type: "proxy_test_failed", userId: user.user.id, characterId: null, reason: "invalid_key" },
      { type: "model_list_failed", userId: user.user.id, characterId: null, reason: "invalid_key" },
    ]);
  });

  it("a login records login", async () => {
    const result = await app
      .get(AuthService)
      .loginWithGoogle({ sub: "google-sub-9", email: "new@example.com", emailVerified: true, name: "New", picture: null }, "2026-01-01");
    expect(result.kind).toBe("ok");
    const login = await prisma.user.findUniqueOrThrow({ where: { googleSub: "google-sub-9" } });
    expect(await events()).toEqual([{ type: "login", userId: login.id, characterId: null, reason: "" }]);
  });
});
