import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CharacterInput } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

/** The app has no 18+ characters. An old 18+ row stays hidden until the delete command removes it. */
describe("an old 18+ character", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let viewer: TestUser;
  let admin: TestUser;
  let adultId: string;

  const http = () => request(app.getHttpServer());
  const get = (id: string, cookie = "") => http().get(`/characters/${id}`).set("Cookie", cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    // The old "Show 18+" setting is on, but it has no effect now.
    viewer = await userWithSession(app, 2, { showAdult: true, adultConfirmedAt: new Date() });
    admin = await userWithSession(app, 3, { role: "admin" });
    adultId = await createCharacter(app, creator.cookie, { title: "Lilith" });
    await prisma.character.update({ where: { id: adultId }, data: { isAdult: true } });
  });

  afterAll(async () => {
    await app.close();
  });

  it("gives 404 not_found to a visitor, to a user and to the creator", async () => {
    for (const cookie of ["", viewer.cookie, creator.cookie]) {
      expect((await get(adultId, cookie).expect(404)).body).toEqual({ error: "not_found" });
    }
  });

  it("the admin still gets the character", async () => {
    expect((await get(adultId, admin.cookie).expect(200)).body.title).toBe("Lilith");
  });

  it("is not in Discover", async () => {
    const res = await http().get("/characters").set("Cookie", viewer.cookie).expect(200);
    expect(res.body.items.map((card: { id: string }) => card.id)).not.toContain(adultId);
  });

  it("a user cannot start a chat with it", async () => {
    await http()
      .post("/chats")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", viewer.cookie)
      .send({ characterId: adultId })
      .expect(404);
  });
});

describe("the 18+ setting", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let viewer: TestUser;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    viewer = await userWithSession(app, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /me/adult-confirm gives 404", async () => {
    await http().post("/me/adult-confirm").set("Origin", WEB_ORIGIN).set("Cookie", viewer.cookie).expect(404);
  });

  it("PATCH /me ignores showAdult, and the response has no showAdult", async () => {
    const res = await http()
      .patch("/me")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", viewer.cookie)
      .send({ showAdult: true, replyChoicesOn: true })
      .expect(200);
    expect(res.body).not.toHaveProperty("showAdult");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id } })).showAdult).toBe(false);
  });

  it("POST /characters ignores isAdult", async () => {
    const id = await createCharacter(app, viewer.cookie, { title: "Mira", isAdult: true } as Partial<CharacterInput>);
    expect((await prisma.character.findUniqueOrThrow({ where: { id } })).isAdult).toBe(false);
  });
});
