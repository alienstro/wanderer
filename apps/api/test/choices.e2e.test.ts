import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { addProxy, parseEvents, postStream, startChat } from "./support/chat-stream.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "./support/fake-ai-server.js";
import { type TestUser, userWithSession } from "./support/users.js";

const FOUR = '["Yes", "No", "Maybe", "Run!"]';

describe("reply choices", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let user: TestUser;
  let chatId: string;

  const choices = (owner = user) =>
    request(app.getHttpServer()).post(`/chats/${chatId}/choices`).set("Origin", WEB_ORIGIN).set("Cookie", owner.cookie);

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

  it("a JSON array of four strings gives the four choices", async () => {
    fake.next({ pieces: [FOUR] });
    const res = await choices().expect(200);
    expect(res.body).toEqual({ choices: ["Yes", "No", "Maybe", "Run!"] });
    const sent = fake.requests.at(-1)!.body;
    expect(sent.stream).toBeFalsy();
    expect(sent.max_tokens).toBe(400);
    expect(sent.messages?.at(-1)?.content).toContain("Write four short replies that User 1 could say next");
  });

  it("prose, then a fenced array, gives the choices after one more try", async () => {
    fake.next({ pieces: ["Sure! Here are some ideas."] }, { pieces: ["```json\n", FOUR, "\n```"] });
    const res = await choices().expect(200);
    expect(res.body.choices).toHaveLength(4);
  });

  it("three items two times gives 502 choices_failed, and the fake server got two requests", async () => {
    const count = fake.requests.length;
    fake.next({ pieces: ['["a", "b", "c"]'] }, { pieces: ['["a", "b", "c"]'] });
    const res = await choices().expect(502);
    expect(res.body).toEqual({ error: "choices_failed" });
    expect(fake.requests.length - count).toBe(2);
  });

  it("a send after choices_failed still works", async () => {
    fake.next({ pieces: ["bad"] }, { pieces: [""] }, { pieces: ["Hello!"] });
    await choices().expect(502);
    const res = await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "done", message: { content: "Hello!" } });
  });

  it("a proxy error gives 502 with the error code, and another user gets 404", async () => {
    fake.next({ status: 401 });
    expect((await choices().expect(502)).body).toEqual({ error: "invalid_key" });
    const other = await userWithSession(app, 2);
    await addProxy(app, other);
    await choices(other).expect(404);
  });

  it("PATCH /me { replyChoicesOn: false } changes GET /me", async () => {
    await request(app.getHttpServer())
      .patch("/me")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", user.cookie)
      .send({ replyChoicesOn: false })
      .expect(200);
    const me = await request(app.getHttpServer()).get("/me").set("Cookie", user.cookie).expect(200);
    expect(me.body.replyChoicesOn).toBe(false);
  });
});
