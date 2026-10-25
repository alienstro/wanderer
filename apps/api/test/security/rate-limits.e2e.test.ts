import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../../src/ai/ai-client.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { addProxy, postStream, startChat } from "../support/chat-stream.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "../support/fake-ai-server.js";
import { type TestUser, userWithSession } from "../support/users.js";

const FOUR = '["Yes", "No", "Maybe", "Run!"]';

describe("per-user rate limits", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let characterId: string;
  let one: TestUser;
  let two: TestUser;

  const post = (user: TestUser, path: string) =>
    request(app.getHttpServer()).post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie);

  async function chatFor(user: TestUser): Promise<string> {
    await addProxy(app, user);
    return startChat(app, user, characterId);
  }

  /** Sends n messages one after the other and gives the status codes. */
  async function sendMany(user: TestUser, chatId: string, n: number): Promise<number[]> {
    const codes: number[] = [];
    for (let i = 0; i < n; i++) {
      codes.push((await postStream(app, user, `/chats/${chatId}/messages`, { content: `Hi ${i}` })).status);
    }
    return codes;
  }

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({ overrides: [{ token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    one = await userWithSession(app, 1);
    two = await userWithSession(app, 2);
    characterId = await createCharacter(app, one.cookie);
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("the 31st send in one minute gives 429, and another user behind the same IP can still send", async () => {
    const chatId = await chatFor(one);
    const codes = await sendMany(one, chatId, 31);
    expect(codes.slice(0, 30).every((code) => code === 200)).toBe(true);
    expect(codes[30]).toBe(429);
    expect(await sendMany(two, await chatFor(two), 1)).toEqual([200]);
  });

  it("Regenerate has its own count", async () => {
    const chatId = await chatFor(one);
    await sendMany(one, chatId, 30);
    await postStream(app, one, `/chats/${chatId}/regenerate`).expect(200);
  });

  it("the 31st choices call in one minute gives 429", async () => {
    const chatId = await chatFor(one);
    for (let i = 0; i < 30; i++) {
      fake.next({ pieces: [FOUR] });
      await post(one, `/chats/${chatId}/choices`).expect(200);
    }
    await post(one, `/chats/${chatId}/choices`).expect(429);
  });

  it("the 11th proxy Test in one minute gives 429", async () => {
    await addProxy(app, one);
    const proxies = await request(app.getHttpServer()).get("/proxies").set("Cookie", one.cookie).expect(200);
    const id = (proxies.body as Array<{ id: string }>)[0]!.id;
    for (let i = 0; i < 10; i++) {
      await post(one, `/proxies/${id}/test`).expect(200);
    }
    await post(one, `/proxies/${id}/test`).expect(429);
  });
});
