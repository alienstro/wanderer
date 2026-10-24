import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { addProxy, postStream, startChat } from "./support/chat-stream.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "./support/fake-ai-server.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("chat memory", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let user: TestUser;
  let chatId: string;

  const systemSent = () => fake.requests.at(-1)!.body.messages?.[0]?.content as string;

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({ overrides: [{ token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    user = await userWithSession(app, 1);
    chatId = await startChat(app, user, await createCharacter(app, user.cookie));
    await addProxy(app, user);
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("GET /chats/:id gives an empty memory for a new chat, and the saved memory later", async () => {
    const get = () => request(app.getHttpServer()).get(`/chats/${chatId}`).set("Cookie", user.cookie).expect(200);
    expect((await get()).body.memory).toEqual({ text: "", throughPosition: null });
    await prisma.chat.update({ where: { id: chatId }, data: { memory: "Mira owes {{user}} a sword.", memoryThroughPosition: 0 } });
    expect((await get()).body.memory).toEqual({ text: "Mira owes {{user}} a sword.", throughPosition: 0 });
  });

  it("the reply prompt and the choices prompt have the memory as the last system section", async () => {
    await prisma.chat.update({ where: { id: chatId }, data: { memory: "Mira owes {{user}} a sword." } });
    fake.next({ pieces: ["Hello!"] });
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    expect(systemSent().endsWith("## Memory\nMira owes User 1 a sword.")).toBe(true);
    fake.next({ pieces: ['["a", "b", "c", "d"]'] });
    await request(app.getHttpServer())
      .post(`/chats/${chatId}/choices`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", user.cookie)
      .expect(200);
    expect(systemSent().endsWith("## Memory\nMira owes User 1 a sword.")).toBe(true);
  });
});
