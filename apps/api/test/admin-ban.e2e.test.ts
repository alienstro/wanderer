import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CharacterListResponse } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("ban a user", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let creator: TestUser;

  const http = () => request(app.getHttpServer());
  const ban = (userId: string, cookie = admin.cookie) =>
    http().post(`/admin/users/${userId}/ban`).set("Origin", WEB_ORIGIN).set("Cookie", cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    admin = await userWithSession(app, 1, { role: "admin" });
    creator = await userWithSession(app, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it("ends the sessions of the user at once", async () => {
    const res = await ban(creator.user.id).expect(200);
    expect(res.body).toEqual({ ok: true });
    await http().get("/me").set("Cookie", creator.cookie).expect(401);
    expect(await prisma.session.count({ where: { userId: creator.user.id } })).toBe(0);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id } });
    expect(row.bannedAt).toBeInstanceOf(Date);
  });

  it("hides the published characters, keeps the drafts, and removes them from Discover", async () => {
    const published = await createCharacter(app, creator.cookie);
    const draft = await createCharacter(app, creator.cookie, { title: "Draft", publish: false });
    await ban(creator.user.id).expect(200);
    const status = async (id: string) => (await prisma.character.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(published)).toBe("hidden");
    expect(await status(draft)).toBe("draft");
    const discover = await http().get("/characters").expect(200);
    expect((discover.body as CharacterListResponse).items).toHaveLength(0);
  });

  it("gives 400 cannot_ban_admin for an admin, 404 for an unknown user, and 403 for a normal user", async () => {
    const other = await userWithSession(app, 3, { role: "admin" });
    const res = await ban(other.user.id).expect(400);
    expect(res.body).toEqual({ error: "cannot_ban_admin" });
    await ban("4b0c5bb4-2d6f-4f43-9d53-5d6e0a8f1c11").expect(404);
    await ban("not-a-uuid").expect(404);
    const user = await userWithSession(app, 4);
    await ban(creator.user.id, user.cookie).expect(403);
  });

  it("a second ban gives 200 and keeps the first time", async () => {
    await ban(creator.user.id).expect(200);
    const first = (await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id } })).bannedAt;
    await ban(creator.user.id).expect(200);
    const second = (await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id } })).bannedAt;
    expect(second).toEqual(first);
  });

  it("the banned action bans the creator and closes all open reports of the character", async () => {
    const characterId = await createCharacter(app, creator.cookie);
    const reporter = await userWithSession(app, 3);
    const data = (reporterId: string) => ({ characterId, characterTitle: "Mira", reporterId, reason: "hate" as const });
    const first = await prisma.report.create({ data: data(reporter.user.id) });
    await prisma.report.create({ data: data(admin.user.id) });
    await http()
      .post(`/admin/reports/${first.id}/resolve`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", admin.cookie)
      .send({ action: "banned" })
      .expect(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id } });
    expect(row.bannedAt).toBeInstanceOf(Date);
    const reports = await prisma.report.findMany({ where: { characterId } });
    expect(reports.every((r) => r.status === "closed" && r.action === "banned")).toBe(true);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).status).toBe("hidden");
  });
});
