import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("character likes", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let fan: TestUser;
  let characterId: string;

  const http = () => request(app.getHttpServer());
  const get = (id: string, cookie = "") => http().get(`/characters/${id}`).set("Cookie", cookie);
  const like = (id: string, cookie: string) =>
    http().put(`/characters/${id}/like`).set("Origin", WEB_ORIGIN).set("Cookie", cookie);
  const unlike = (id: string, cookie: string) =>
    http().delete(`/characters/${id}/like`).set("Origin", WEB_ORIGIN).set("Cookie", cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    owner = await userWithSession(app, 1);
    fan = await userWithSession(app, 2);
    characterId = await createCharacter(app, owner.cookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it("PUT likes the character", async () => {
    const res = await like(characterId, fan.cookie).expect(200);
    expect(res.body).toEqual({ likeCount: 1, likedByMe: true });

    const detail = await get(characterId, fan.cookie).expect(200);
    expect(detail.body).toMatchObject({ likeCount: 1, likedByMe: true });
  });

  it("two PUT calls add one like", async () => {
    await Promise.all([like(characterId, fan.cookie).expect(200), like(characterId, fan.cookie).expect(200)]);

    const detail = await get(characterId, fan.cookie).expect(200);
    expect(detail.body).toMatchObject({ likeCount: 1, likedByMe: true });
  });

  it("DELETE removes the like, and a second DELETE changes nothing", async () => {
    await like(characterId, fan.cookie).expect(200);

    const first = await unlike(characterId, fan.cookie).expect(200);
    expect(first.body).toEqual({ likeCount: 0, likedByMe: false });
    const second = await unlike(characterId, fan.cookie).expect(200);
    expect(second.body).toEqual({ likeCount: 0, likedByMe: false });
  });

  it("a second user sees the count but not the like as their own", async () => {
    const third = await userWithSession(app, 3);
    await like(characterId, fan.cookie).expect(200);

    const detail = await get(characterId, third.cookie).expect(200);
    expect(detail.body).toMatchObject({ likeCount: 1, likedByMe: false });
  });

  it("a visitor sees the count and cannot like", async () => {
    await like(characterId, fan.cookie).expect(200);

    const detail = await get(characterId).expect(200);
    expect(detail.body).toMatchObject({ likeCount: 1, likedByMe: false });
    await like(characterId, "").expect(401);
  });

  it("the card in Discover has the count", async () => {
    await like(characterId, fan.cookie).expect(200);

    const res = await http().get("/characters").expect(200);
    expect(res.body.items[0]).toMatchObject({ id: characterId, likeCount: 1 });
    expect(res.body.items[0]).not.toHaveProperty("likedByMe");
  });

  it("the owner cannot like their own character", async () => {
    const res = await like(characterId, owner.cookie).expect(400);
    expect(res.body).toEqual({ error: "own_character" });
  });

  it("PUT and DELETE on a private character of another user give 404", async () => {
    const hiddenId = await createCharacter(app, owner.cookie, { title: "Secret", isPublic: false });

    const res = await like(hiddenId, fan.cookie).expect(404);
    expect(res.body).toEqual({ error: "not_found" });
    await unlike(hiddenId, fan.cookie).expect(404);
  });

  it("PUT on an 18+ character without Show 18+ gives 403", async () => {
    const adultId = await createCharacter(app, owner.cookie, { title: "Night", isAdult: true });

    const res = await like(adultId, fan.cookie).expect(403);
    expect(res.body).toEqual({ error: "adult_content" });
  });

  it("PUT with an ID that is not a UUID gives 404", async () => {
    await like("not-a-uuid", fan.cookie).expect(404);
  });
});
