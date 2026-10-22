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

describe("regenerate", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let baseUrl: string;
  let user: TestUser;
  let chatId: string;

  const messages = () => prisma.message.findMany({ where: { chatId }, orderBy: { position: "asc" } });
  const regenerate = () => postStream(app, user, `/chats/${chatId}/regenerate`);

  async function sendAndReply(reply: string) {
    fake.next({ pieces: [reply] });
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
  }

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
    chatId = await startChat(app, user, await createCharacter(app, user.cookie, { openings: ["Hello."] }));
    await addProxy(app, user);
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("regenerate replaces the content of the last reply and keeps its ID", async () => {
    await sendAndReply("Old reply");
    const old = (await messages()).at(-1)!;
    fake.next({ pieces: ["New ", "reply"] });
    const res = await regenerate().expect(200);
    const events = parseEvents(res.body as string);
    expect(events[0]).toEqual({ type: "start", userMessage: null });
    expect(events.at(-1)).toMatchObject({ type: "done", message: { id: old.id, content: "New reply" } });
    expect((await messages()).map((m) => m.content)).toEqual(["Hello.", "Hi", "New reply"]);
    expect(fake.requests.at(-1)?.body.messages?.map((m) => m.content).slice(1)).toEqual(["Hello.", "Hi"]);
  });

  it("regenerate after a user message with no reply makes a new reply", async () => {
    fake.next({ status: 500 });
    await postStream(app, user, `/chats/${chatId}/messages`, { content: "Hi" }).expect(200);
    fake.next({ pieces: ["Fresh"] });
    const res = await regenerate().expect(200);
    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "done", message: { position: 2 } });
    expect((await messages()).map((m) => m.content)).toEqual(["Hello.", "Hi", "Fresh"]);
  });

  it("regenerate on a chat with only the opening gives 409 nothing_to_regenerate", async () => {
    const res = await regenerate().expect(409);
    expect(JSON.parse(res.body as string)).toEqual({ error: "nothing_to_regenerate" });
  });

  it("a regenerate that gets a 500 before the first piece keeps the old reply", async () => {
    await sendAndReply("Old reply");
    fake.next({ status: 500 });
    const res = await regenerate().expect(200);
    expect(parseEvents(res.body as string).at(-1)).toMatchObject({ type: "error", error: "provider_error" });
    expect((await messages()).at(-1)?.content).toBe("Old reply");
  });

  it("a client abort before the first piece keeps the old reply", async () => {
    await sendAndReply("Old reply");
    const count = fake.requests.length;
    fake.next({ pieces: ["late"], firstDelayMs: 250 });
    const stream = openStream(baseUrl, user, `/chats/${chatId}/regenerate`, {}, 0);
    await stream;
    await waitFor(() => Promise.resolve(fake.requests.length > count));
    // Wait past the first piece, so a wrong save would show.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((await messages()).map((m) => m.content)).toEqual(["Hello.", "Hi", "Old reply"]);
  });
});
