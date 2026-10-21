import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { startChat } from "./support/chat-stream.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("For you", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let reader: TestUser;

  const forYou = (user: TestUser) => request(app.getHttpServer()).get("/characters/for-you").set("Cookie", user.cookie);
  const titles = (body: { items: Array<{ title: string }> }) => body.items.map((item) => item.title);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    reader = await userWithSession(app, 2, { showAdult: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("a user with two horror chats gets horror characters that they have not chatted with", async () => {
    const first = await createCharacter(app, creator.cookie, { title: "Ghost", tags: ["horror"] });
    const second = await createCharacter(app, creator.cookie, { title: "Crypt", tags: ["horror", "mystery"] });
    await createCharacter(app, creator.cookie, { title: "Haunt", tags: ["horror"] });
    await createCharacter(app, creator.cookie, { title: "Farm", tags: ["slice-of-life"] });
    await startChat(app, reader, first);
    await startChat(app, reader, second);
    const res = await forYou(reader).expect(200);
    expect(titles(res.body)).toEqual(["Haunt"]);
  });

  it("a user with no chats gets an empty list", async () => {
    await createCharacter(app, creator.cookie, { title: "Ghost", tags: ["horror"] });
    expect((await forYou(reader).expect(200)).body).toEqual({ items: [] });
  });

  it("the list has no private, draft, own, or blocked 18+ character", async () => {
    const seed = await createCharacter(app, creator.cookie, { title: "Seed", tags: ["noir"] });
    await startChat(app, reader, seed);
    await createCharacter(app, creator.cookie, { title: "Private", tags: ["noir"], isPublic: false });
    await createCharacter(app, creator.cookie, { title: "Draft", tags: ["noir"], publish: false });
    await createCharacter(app, creator.cookie, { title: "Adult", tags: ["noir"], isAdult: true });
    await createCharacter(app, reader.cookie, { title: "Own", tags: ["noir"] });
    await createCharacter(app, creator.cookie, { title: "Open", tags: ["noir"] });
    expect(titles((await forYou(reader).expect(200)).body)).toEqual(["Open"]);
  });

  it("a visitor gets 401", async () => {
    await request(app.getHttpServer()).get("/characters/for-you").expect(401);
  });
});
