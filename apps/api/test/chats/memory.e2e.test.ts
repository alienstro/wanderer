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

describe("chat memory", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let user: TestUser;
  let chatId: string;

  const patch = (body: object, owner = user) =>
    request(app.getHttpServer())
      .patch(`/chats/${chatId}/memory`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", owner.cookie)
      .send(body);
  const summarize = (owner = user, body: object = {}) =>
    request(app.getHttpServer())
      .post(`/chats/${chatId}/memory/summarize`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", owner.cookie)
      .send(body);
  /** Adds messages 1 to `count` of about 1,000 tokens each. Message n starts with "m<n> ". */
  const addLongMessages = (count: number) =>
    prisma.message.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        chatId,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `m${index + 1} ${"x".repeat(3990)}`,
        position: index + 1,
      })),
    });
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

  it("PATCH /chats/:id/memory saves the trimmed text and the marker, and a save without a marker keeps the old one", async () => {
    const saved = await patch({ memory: "  Mira owes {{user}} a sword.  ", throughPosition: 0 }).expect(200);
    expect(saved.body).toEqual({ text: "Mira owes {{user}} a sword.", throughPosition: 0 });
    expect((await patch({ memory: "Mira paid the debt." }).expect(200)).body).toEqual({
      text: "Mira paid the debt.",
      throughPosition: 0,
    });
    const row = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });
    expect([row.memory, row.memoryThroughPosition]).toEqual(["Mira paid the debt.", 0]);
  });

  it("a text over 2,000 characters gives 400 invalid_memory and saves nothing", async () => {
    const res = await patch({ memory: "x".repeat(2001) }).expect(400);
    expect(res.body).toEqual({ error: "invalid_memory" });
    expect((await prisma.chat.findUniqueOrThrow({ where: { id: chatId } })).memory).toBe("");
  });

  it("a marker after the last message gives 400 invalid_memory", async () => {
    expect((await patch({ memory: "Facts.", throughPosition: 5 }).expect(400)).body).toEqual({ error: "invalid_memory" });
  });

  it("another user gets 404 for the memory of the chat", async () => {
    const other = await userWithSession(app, 2);
    await patch({ memory: "Stolen." }, other).expect(404);
  });

  it("summarize sends the memory and only the old messages after the marker, gives a draft, and saves nothing", async () => {
    await addLongMessages(30);
    await prisma.chat.update({ where: { id: chatId }, data: { memory: "Mira owes {{user}} a sword.", memoryThroughPosition: 3 } });
    fake.next({ pieces: ["Mira owes User 1 a sword.\nThe ship is in Port Vel."] });
    const res = await summarize().expect(200);
    expect(res.body.memory).toBe("Mira owes User 1 a sword.\nThe ship is in Port Vel.");
    const through = res.body.throughPosition as number;
    const sent = JSON.stringify(fake.requests.at(-1)!.body.messages);
    expect(sent).toContain("Mira owes User 1 a sword.");
    expect(sent).toContain(`m4 `);
    expect(sent).not.toContain(`m3 `);
    expect(sent).toContain(`m${through} `);
    expect(sent).not.toContain(`m${through + 1} `);
    expect(sent).not.toContain(`m30 `);
    // The summary input is half of the 16,000-token budget or less.
    expect(sent.length / 4).toBeLessThan(8_500);
    const row = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } });
    expect([row.memory, row.memoryThroughPosition]).toEqual(["Mira owes {{user}} a sword.", 3]);
  });

  it("summarize gives the saved memory and makes no proxy call when no old message is new", async () => {
    await prisma.chat.update({ where: { id: chatId }, data: { memory: "Facts." } });
    const count = fake.requests.length;
    expect((await summarize().expect(200)).body).toEqual({ memory: "Facts.", throughPosition: null });
    expect(fake.requests.length).toBe(count);
  });

  it("summarize gives 502 with the code for a proxy error, and 404 for another user", async () => {
    await addLongMessages(30);
    fake.next({ status: 401 });
    expect((await summarize().expect(502)).body).toEqual({ error: "invalid_key" });
    const other = await userWithSession(app, 2);
    await addProxy(app, other);
    await summarize(other).expect(404);
  });

  it("summarize uses the unsaved text and marker of the panel from the body", async () => {
    await addLongMessages(30);
    await prisma.chat.update({ where: { id: chatId }, data: { memory: "Saved fact.", memoryThroughPosition: 3 } });
    fake.next({ pieces: ["Draft."] });
    await summarize(user, { memory: "Typed fact.", throughPosition: 6 }).expect(200);
    const sent = JSON.stringify(fake.requests.at(-1)!.body.messages);
    expect(sent).toContain("Typed fact.");
    expect(sent).not.toContain("Saved fact.");
    expect(sent).toContain("m7 ");
    expect(sent).not.toContain("m6 ");
    await summarize(user, { memory: "x".repeat(2001) }).expect(400);
  });
});
