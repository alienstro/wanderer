import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ChatDetail, Persona } from "@wanderer/shared";
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

describe("the persona of a chat", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;
  let characterId: string;

  const api = () => request(app.getHttpServer());
  const send = (method: "post" | "patch" | "delete", path: string, body: object = {}) =>
    api()[method](path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const startChat = async (): Promise<ChatDetail> => (await send("post", "/chats", { characterId }).expect(201)).body;
  const openChat = async (id: string): Promise<ChatDetail> =>
    (await api().get(`/chats/${id}`).set("Cookie", user.cookie).expect(200)).body;
  const addPersona = async (name: string, description = ""): Promise<Persona> =>
    (await send("post", "/personas", { name, description }).expect(201)).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    user = await userWithSession(app, 1);
    characterId = await createCharacter(app, user.cookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it("copies the default persona into a new chat", async () => {
    await addPersona("Aria", "A knight with a scar.");
    const sam = await addPersona("Sam", "A student.");
    await send("post", `/personas/${sam.id}/default`).expect(200);

    const detail = await startChat();
    expect(detail.personaName).toBe("Sam");
    const row = await prisma.chat.findUniqueOrThrow({ where: { id: detail.chat.id } });
    expect([row.personaName, row.personaDescription]).toEqual(["Sam", "A student."]);
  });

  it("keeps the old copy after the persona is edited", async () => {
    const aria = await addPersona("Aria", "A knight with a scar.");
    const detail = await startChat();
    await send("patch", `/personas/${aria.id}`, { name: "Ari", description: "A student." }).expect(200);

    expect((await openChat(detail.chat.id)).personaName).toBe("Aria");
    const row = await prisma.chat.findUniqueOrThrow({ where: { id: detail.chat.id } });
    expect(row.personaDescription).toBe("A knight with a scar.");
  });

  it("keeps the copy after the persona is deleted", async () => {
    const aria = await addPersona("Aria", "A knight with a scar.");
    const detail = await startChat();
    await send("delete", `/personas/${aria.id}`).expect(204);

    expect((await openChat(detail.chat.id)).personaName).toBe("Aria");
  });

  it("gives personaName null to a user with no persona", async () => {
    const detail = await startChat();
    expect(detail.personaName).toBeNull();
    const row = await prisma.chat.findUniqueOrThrow({ where: { id: detail.chat.id } });
    expect([row.personaName, row.personaDescription]).toEqual([null, null]);
  });
});

describe("the AI calls of a chat with a persona", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let user: TestUser;
  let chatId: string;

  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send({});
  const sentText = () => JSON.stringify(fake.requests.at(-1)!.body.messages);

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({ overrides: [{ token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    user = await userWithSession(app, 1);
    await post("/personas").send({ name: "Aria", description: "A knight with a scar." }).expect(201);
    chatId = await startChat(app, user, await createCharacter(app, user.cookie));
    await addProxy(app, user);
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("sends the persona to the reply", async () => {
    fake.next({ pieces: ["Hello!"] });
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    const sent = sentText();
    expect(sent).toContain("in a roleplay with Aria.");
    expect(sent).toContain("## User\\nAria: A knight with a scar.");
    expect(sent).not.toContain("User 1");
  });

  it("sends the persona name to the reply choices", async () => {
    fake.next({ pieces: ['["Yes", "No", "Maybe", "Run!"]'] });
    await post(`/chats/${chatId}/choices`).expect(200);
    expect(sentText()).toContain("Write four short replies that Aria could say next");
    expect(sentText()).not.toContain("User 1");
  });

  it("sends the persona name to the memory summary", async () => {
    await prisma.message.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        chatId,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `m${index + 1} ${"x".repeat(3990)}`,
        position: index + 1,
      })),
    });
    fake.next({ pieces: ["Mira owes Aria a sword."] });
    await post(`/chats/${chatId}/memory/summarize`).expect(200);
    expect(sentText()).toContain("and Aria.");
    expect(sentText()).not.toContain("User 1");
  });
});
