import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("the 18+ setting and the 18+ gate", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let viewer: TestUser;
  let adultId: string;

  const http = () => request(app.getHttpServer());
  const get = (id: string, cookie = "") => http().get(`/characters/${id}`).set("Cookie", cookie);
  const confirm = (cookie: string) => http().post("/me/adult-confirm").set("Origin", WEB_ORIGIN).set("Cookie", cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    viewer = await userWithSession(app, 2);
    adultId = await createCharacter(app, creator.cookie, { title: "Lilith", isAdult: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it("a visitor gets 403 adult_content for an 18+ character, and the body has no other field", async () => {
    const res = await get(adultId).expect(403);
    expect(res.body).toEqual({ error: "adult_content" });
  });

  it("a user with showAdult false gets 403 adult_content, and the creator gets their own 18+ character", async () => {
    expect((await get(adultId, viewer.cookie).expect(403)).body).toEqual({ error: "adult_content" });
    expect((await get(adultId, creator.cookie).expect(200)).body).toMatchObject({ title: "Lilith", isAdult: true });
  });

  it("PATCH /me showAdult true before the confirm gives 400 adult_not_confirmed", async () => {
    const res = await http()
      .patch("/me")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", viewer.cookie)
      .send({ showAdult: true })
      .expect(400);
    expect(res.body).toEqual({ error: "adult_not_confirmed" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id } })).showAdult).toBe(false);
  });

  it("POST /me/adult-confirm saves the time one time, and a second call keeps the first time", async () => {
    const first = await confirm(viewer.cookie).expect(201);
    expect(first.body).toMatchObject({ showAdult: true });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id } });
    expect(saved.adultConfirmedAt).toBeInstanceOf(Date);

    await http().patch("/me").set("Origin", WEB_ORIGIN).set("Cookie", viewer.cookie).send({ showAdult: false }).expect(200);
    await confirm(viewer.cookie).expect(201);

    const again = await prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id } });
    expect(again.adultConfirmedAt).toEqual(saved.adultConfirmedAt);
    expect(again.showAdult).toBe(true);
  });

  it("after the confirm, the same GET gives the character", async () => {
    await get(adultId, viewer.cookie).expect(403);
    await confirm(viewer.cookie).expect(201);
    expect((await get(adultId, viewer.cookie).expect(200)).body.title).toBe("Lilith");
  });

  it("a confirmed user can turn showAdult off and on with PATCH /me", async () => {
    await confirm(viewer.cookie).expect(201);
    const off = await http().patch("/me").set("Origin", WEB_ORIGIN).set("Cookie", viewer.cookie).send({ showAdult: false }).expect(200);
    expect(off.body.showAdult).toBe(false);
    await get(adultId, viewer.cookie).expect(403);
    const on = await http().patch("/me").set("Origin", WEB_ORIGIN).set("Cookie", viewer.cookie).send({ showAdult: true }).expect(200);
    expect(on.body.showAdult).toBe(true);
  });
});
