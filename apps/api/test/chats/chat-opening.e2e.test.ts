import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatLocks } from "../../src/chats/chat-locks.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

const OPENINGS = ["The engine coughs again.", "A storm hits the hull.", "The radio wakes at midnight."];

describe("PATCH /chats/:id/opening", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let reader: TestUser;
  let other: TestUser;
  let characterId: string;
  let chatId: string;

  const api = () => request(app.getHttpServer());
  const pick = (user: TestUser, body: object, id = chatId) =>
    api().patch(`/chats/${id}/opening`).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const messagesOf = (id: string) => prisma.message.findMany({ where: { chatId: id }, orderBy: { position: "asc" } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    reader = await userWithSession(app, 2);
    other = await userWithSession(app, 3);
    characterId = await createCharacter(app, creator.cookie, { chatName: "Mi", openings: OPENINGS });
    const res = await api()
      .post("/chats")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", reader.cookie)
      .send({ characterId })
      .expect(201);
    chatId = res.body.chat.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("opening 2 replaces message 0, keeps one message, and a new GET shows the same", async () => {
    const res = await pick(reader, { openingIndex: 2 }).expect(200);
    expect(res.body.messages).toEqual([
      expect.objectContaining({ role: "assistant", content: OPENINGS[2], position: 0, editedAt: null }),
    ]);
    expect(res.body.opening).toEqual({ index: 2, count: 3 });
    const detail = await api().get(`/chats/${chatId}`).set("Cookie", reader.cookie).expect(200);
    expect(detail.body.messages.map((message: { content: string }) => message.content)).toEqual([OPENINGS[2]]);
    expect(detail.body.opening).toEqual({ index: 2, count: 3 });
  });

  it("after a user message gives 409 opening_locked and changes nothing", async () => {
    await prisma.message.create({ data: { chatId, role: "user", content: "Hello there", position: 1 } });
    const res = await pick(reader, { openingIndex: 1 }).expect(409);
    expect(res.body.error).toBe("opening_locked");
    expect((await messagesOf(chatId)).map((message) => message.content)).toEqual([OPENINGS[0], "Hello there"]);
    expect((await prisma.chat.findUniqueOrThrow({ where: { id: chatId } })).openingIndex).toBe(0);
  });

  it("an index with no opening, or a body with no index, gives 400 invalid_opening", async () => {
    expect((await pick(reader, { openingIndex: 7 }).expect(400)).body.error).toBe("invalid_opening");
    expect((await pick(reader, {}).expect(400)).body.error).toBe("invalid_opening");
    expect((await messagesOf(chatId))[0]?.content).toBe(OPENINGS[0]);
  });

  it("the chat of another user gives 404", async () => {
    await pick(other, { openingIndex: 1 }).expect(404);
    expect((await messagesOf(chatId))[0]?.content).toBe(OPENINGS[0]);
  });

  it("a character that is now private gives 404, so a hidden opening never shows", async () => {
    await prisma.character.update({ where: { id: characterId }, data: { isPublic: false } });
    await pick(reader, { openingIndex: 1 }).expect(404);
    expect((await messagesOf(chatId))[0]?.content).toBe(OPENINGS[0]);
  });

  it("while a reply holds the chat lock gives 409 chat_busy", async () => {
    let release = () => {};
    const held = app.get(ChatLocks).run(reader.user.id, chatId, () => new Promise<void>((resolve) => (release = resolve)));
    const res = await pick(reader, { openingIndex: 1 }).expect(409);
    expect(res.body.error).toBe("chat_busy");
    release();
    await held;
    await pick(reader, { openingIndex: 1 }).expect(200);
  });
});
