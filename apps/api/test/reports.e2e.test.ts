import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("POST /characters/:id/report", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let reporter: TestUser;
  let characterId: string;

  const report = (id: string, cookie: string, body: unknown = { reason: "hate", note: "Rude words." }) =>
    request(app.getHttpServer())
      .post(`/characters/${id}/report`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", cookie)
      .send(body as object);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    reporter = await userWithSession(app, 2);
    characterId = await createCharacter(app, creator.cookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it("saves a valid report with the title copy and gives 201 with the id", async () => {
    const res = await report(characterId, reporter.cookie).expect(201);
    const row = await prisma.report.findUniqueOrThrow({ where: { id: (res.body as { id: string }).id } });
    expect(row).toMatchObject({
      characterId,
      characterTitle: "Mira",
      reporterId: reporter.user.id,
      reason: "hate",
      note: "Rude words.",
      status: "open",
    });
  });

  it("gives 400 invalid_request for a note of 501 characters and for an unknown reason", async () => {
    const long = await report(characterId, reporter.cookie, { reason: "hate", note: "a".repeat(501) }).expect(400);
    expect(long.body).toEqual({ error: "invalid_request" });
    await report(characterId, reporter.cookie, { reason: "spam" }).expect(400);
  });

  it("gives 404 for a private, a draft, a hidden, and a blocked 18+ character", async () => {
    const privateId = await createCharacter(app, creator.cookie, { title: "Private", isPublic: false });
    const draftId = await createCharacter(app, creator.cookie, { title: "Draft", publish: false });
    const hiddenId = await createCharacter(app, creator.cookie, { title: "Hidden" });
    await prisma.character.update({ where: { id: hiddenId }, data: { status: "hidden" } });
    const adultId = await createCharacter(app, creator.cookie, { title: "Adult", isAdult: true });
    for (const id of [privateId, draftId, hiddenId, adultId, "not-a-uuid"]) {
      const res = await report(id, reporter.cookie).expect(404);
      expect(res.body).toEqual({ error: "not_found" });
    }
    expect(await prisma.report.count()).toBe(0);
  });

  it("gives 400 own_character when the creator reports their own character", async () => {
    const res = await report(characterId, creator.cookie).expect(400);
    expect(res.body).toEqual({ error: "own_character" });
  });

  it("gives 409 already_reported for a second report on the same character", async () => {
    await report(characterId, reporter.cookie).expect(201);
    const res = await report(characterId, reporter.cookie, { reason: "other" }).expect(409);
    expect(res.body).toEqual({ error: "already_reported" });
  });

  it("gives 429 report_limit for the 11th report in 24 hours", async () => {
    await prisma.report.createMany({
      data: Array.from({ length: 10 }, () => ({ characterTitle: "Gone", reporterId: reporter.user.id, reason: "other" as const })),
    });
    const res = await report(characterId, reporter.cookie).expect(429);
    expect(res.body).toEqual({ error: "report_limit" });
  });

  it("lets only one of 5 reports at the same time pass when 9 reports are already saved", async () => {
    await prisma.report.createMany({
      data: Array.from({ length: 9 }, () => ({ characterTitle: "Gone", reporterId: reporter.user.id, reason: "other" as const })),
    });
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => createCharacter(app, creator.cookie, { title: `Race ${n}` })),
    );
    const results = await Promise.all(ids.map((id) => report(id, reporter.cookie)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 429)).toHaveLength(4);
  });

  it("counts only the reports of the last 24 hours for the limit", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.report.createMany({
      data: Array.from({ length: 10 }, () => ({
        characterTitle: "Gone",
        reporterId: reporter.user.id,
        reason: "other" as const,
        createdAt: old,
      })),
    });
    await report(characterId, reporter.cookie).expect(201);
  });

  it("gives 401 to a visitor", async () => {
    await report(characterId, "").expect(401);
  });
});

describe("admin access to characters", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it("the admin sees a hidden character, and another user gets 404", async () => {
    const creator = await userWithSession(app, 1);
    const user = await userWithSession(app, 2);
    const admin = await userWithSession(app, 3, { role: "admin" });
    const id = await createCharacter(app, creator.cookie);
    await prisma.character.update({ where: { id }, data: { status: "hidden" } });
    const get = (cookie: string) => request(app.getHttpServer()).get(`/characters/${id}`).set("Cookie", cookie);
    await get(user.cookie).expect(404);
    const res = await get(admin.cookie).expect(200);
    expect((res.body as { title: string }).title).toBe("Mira");
  });
});
