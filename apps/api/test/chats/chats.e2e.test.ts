import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("chats", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let reader: TestUser;
  let other: TestUser;
  let characterId: string;

  const api = () => request(app.getHttpServer());
  const send = (method: "post" | "patch" | "delete", user: TestUser, path: string, body?: object) =>
    api()[method](path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const get = (user: TestUser, path: string) => api().get(path).set("Cookie", user.cookie);
  const startChat = (user: TestUser, openingIndex = 0, id = characterId) =>
    send("post", user, "/chats", { characterId: id, openingIndex });

  /** Adds a user message after the opening, as the send endpoint does. */
  async function addUserMessage(chatId: string, content = "Hello there") {
    return prisma.message.create({ data: { chatId, role: "user", content, position: 1 } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    reader = await userWithSession(app, 2);
    other = await userWithSession(app, 3);
    characterId = await createCharacter(app, creator.cookie, {
      chatName: "Mi",
      openings: ["The engine coughs again.", "A storm hits the hull."],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /chats with openingIndex 1 makes a chat whose message 0 is the second opening", async () => {
    const res = await startChat(reader, 1).expect(201);
    expect(res.body.chat).toMatchObject({ title: "Mi", lastMessage: "A storm hits the hull.", messageCount: 1 });
    expect(res.body.chat.character).toMatchObject({ id: characterId, title: "Mira", chatName: "Mi" });
    expect(res.body.messages).toEqual([
      expect.objectContaining({ role: "assistant", content: "A storm hits the hull.", position: 0, editedAt: null }),
    ]);
    expect(res.body.canSend).toBe(true);
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(character.chatCount).toBe(1);
  });

  it("POST /chats without openingIndex starts with opening 0", async () => {
    const res = await send("post", reader, "/chats", { characterId }).expect(201);
    expect(res.body.messages).toEqual([expect.objectContaining({ content: "The engine coughs again.", position: 0 })]);
    expect(res.body.opening).toEqual({ index: 0, count: 2 });
  });

  it("POST /chats with openingIndex 1 sends opening { index: 1, count: 2 }, and GET sends the same", async () => {
    const res = await startChat(reader, 1).expect(201);
    expect(res.body.opening).toEqual({ index: 1, count: 2 });
    const detail = await get(reader, `/chats/${res.body.chat.id}`).expect(200);
    expect(detail.body.opening).toEqual({ index: 1, count: 2 });
  });

  it("GET /chats/:id clamps opening.index when the creator deleted openings", async () => {
    const res = await startChat(reader, 1).expect(201);
    await prisma.chat.update({ where: { id: res.body.chat.id }, data: { openingIndex: 5 } });
    const detail = await get(reader, `/chats/${res.body.chat.id}`).expect(200);
    expect(detail.body.opening).toEqual({ index: 1, count: 2 });
  });

  it("POST /chats with openingIndex 5 for a character with 2 openings gives 400 invalid_opening", async () => {
    const res = await startChat(reader, 5).expect(400);
    expect(res.body.error).toBe("invalid_opening");
  });

  it("POST /chats for a private character of another user gives 404, and for a blocked 18+ character 403", async () => {
    const hidden = await createCharacter(app, creator.cookie, { title: "Hidden", isPublic: false });
    await startChat(reader, 0, hidden).expect(404);
    const adult = await createCharacter(app, creator.cookie, { title: "Adult", isAdult: true });
    const res = await startChat(reader, 0, adult).expect(403);
    expect(res.body).toEqual({ error: "adult_content" });
    await startChat(creator, 0, hidden).expect(201);
  });

  it("GET /chats lists the newest chat first, and characterId filters the list", async () => {
    const second = await createCharacter(app, creator.cookie, { title: "Second" });
    const first = await startChat(reader).expect(201);
    const later = await startChat(reader, 0, second).expect(201);
    const all = await get(reader, "/chats").expect(200);
    expect(all.body.items.map((chat: { id: string }) => chat.id)).toEqual([later.body.chat.id, first.body.chat.id]);
    const filtered = await get(reader, `/chats?characterId=${characterId}`).expect(200);
    expect(filtered.body.items.map((chat: { id: string }) => chat.id)).toEqual([first.body.chat.id]);
    expect((await get(other, "/chats").expect(200)).body.items).toEqual([]);
  });

  it("GET /chats and GET /chats/:id give the number of messages in each chat", async () => {
    const chat = await startChat(reader).expect(201);
    await addUserMessage(chat.body.chat.id);
    const [item] = (await get(reader, `/chats?characterId=${characterId}`).expect(200)).body.items;
    expect(item).toMatchObject({ id: chat.body.chat.id, messageCount: 2 });
    expect((await get(reader, `/chats/${chat.body.chat.id}`).expect(200)).body.chat.messageCount).toBe(2);
  });

  it("PATCH /messages/:id of a user message sets editedAt, and of the opening gives 404", async () => {
    const chat = await startChat(reader).expect(201);
    const message = await addUserMessage(chat.body.chat.id);
    const res = await send("patch", reader, `/messages/${message.id}`, { content: " Hi again " }).expect(200);
    expect(res.body).toMatchObject({ id: message.id, content: "Hi again", role: "user" });
    expect(res.body.editedAt).not.toBeNull();
    await send("patch", reader, `/messages/${chat.body.messages[0].id}`, { content: "No" }).expect(404);
    await send("patch", reader, `/messages/${message.id}`, { content: "  " }).expect(400);
    await send("delete", reader, `/messages/${message.id}`).expect(204);
    expect(await prisma.message.count({ where: { chatId: chat.body.chat.id } })).toBe(1);
  });

  it("DELETE /chats/:id removes the chat, and chatCount does not go down", async () => {
    const chat = await startChat(reader).expect(201);
    await send("delete", reader, `/chats/${chat.body.chat.id}`).expect(204);
    await get(reader, `/chats/${chat.body.chat.id}`).expect(404);
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(character.chatCount).toBe(1);
  });

  it("another user gets 404 for GET, DELETE, and message PATCH and DELETE", async () => {
    const chat = await startChat(reader).expect(201);
    const message = await addUserMessage(chat.body.chat.id);
    await get(other, `/chats/${chat.body.chat.id}`).expect(404);
    await send("delete", other, `/chats/${chat.body.chat.id}`).expect(404);
    await send("patch", other, `/messages/${message.id}`, { content: "Mine" }).expect(404);
    await send("delete", other, `/messages/${message.id}`).expect(404);
    await get(other, "/chats/not-a-uuid").expect(404);
    expect(await prisma.message.count({ where: { chatId: chat.body.chat.id } })).toBe(2);
  });

  it("GET /chats/:id gives canSend false after the creator makes the character private", async () => {
    const chat = await startChat(reader).expect(201);
    await send("patch", creator, `/characters/${characterId}`, { isPublic: false }).expect(200);
    const res = await get(reader, `/chats/${chat.body.chat.id}`).expect(200);
    expect(res.body.canSend).toBe(false);
    expect(res.body.messages).toHaveLength(1);
  });
});
