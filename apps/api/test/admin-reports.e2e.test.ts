import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AdminReport, AdminReportList, ReportReason } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("admin reports", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let creator: TestUser;
  let reporter: TestUser;
  let characterId: string;

  const http = () => request(app.getHttpServer());
  const list = (cookie: string) => http().get("/admin/reports").set("Cookie", cookie);
  const resolve = (id: string, action: string, cookie = admin.cookie) =>
    http().post(`/admin/reports/${id}/resolve`).set("Origin", WEB_ORIGIN).set("Cookie", cookie).send({ action });

  /** Saves a report with Prisma. `minutesAgo` sets the order of the list. */
  async function addReport(reporterId: string, reason: ReportReason, minutesAgo: number, character = characterId) {
    const row = await prisma.report.create({
      data: {
        characterId: character,
        characterTitle: "Mira",
        reporterId,
        reason,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      },
    });
    return row.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    admin = await userWithSession(app, 1, { role: "admin" });
    creator = await userWithSession(app, 2);
    reporter = await userWithSession(app, 3);
    characterId = await createCharacter(app, creator.cookie);
  });

  afterAll(async () => {
    // Leave no reports. A report row with two user keys stops a later user.deleteMany() in another file.
    await prisma.report.deleteMany();
    await app.close();
  });

  it("gives 403 forbidden to a normal user and 401 to a visitor", async () => {
    const res = await list(reporter.cookie).expect(403);
    expect(res.body).toEqual({ error: "forbidden" });
    await list("").expect(401);
    const id = await addReport(reporter.user.id, "hate", 1);
    await resolve(id, "none", reporter.cookie).expect(403);
  });

  it("lists only open reports, minors first, then the oldest first", async () => {
    const other = await userWithSession(app, 4);
    const third = await userWithSession(app, 5);
    const newHate = await addReport(reporter.user.id, "hate", 1);
    const oldCopied = await addReport(other.user.id, "copied", 30);
    const minors = await addReport(third.user.id, "minors", 0);
    const closed = await addReport(admin.user.id, "other", 60);
    await prisma.report.update({ where: { id: closed }, data: { status: "closed", action: "none" } });

    const res = await list(admin.cookie).expect(200);
    const reports = (res.body as AdminReportList).reports;
    expect(reports.map((r) => r.id)).toEqual([minors, oldCopied, newHate]);
    expect(reports[2]).toMatchObject({
      reason: "hate",
      characterTitle: "Mira",
      character: { id: characterId, creatorId: creator.user.id, creatorHandle: "user_2", status: "published" },
      reporterHandle: "user_3",
    });
  });

  it("none closes only that report, and a second resolve gives 409 report_closed", async () => {
    const first = await addReport(reporter.user.id, "hate", 2);
    const second = await addReport(admin.user.id, "other", 1);
    await resolve(first, "none").expect(200);
    const row = await prisma.report.findUniqueOrThrow({ where: { id: first } });
    expect(row).toMatchObject({ status: "closed", action: "none", resolvedById: admin.user.id });
    expect(row.resolvedAt).toBeInstanceOf(Date);
    expect((await prisma.report.findUniqueOrThrow({ where: { id: second } })).status).toBe("open");

    const again = await resolve(first, "hidden").expect(409);
    expect(again.body).toEqual({ error: "report_closed" });
    expect((await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).status).toBe("published");
  });

  it("hidden hides the character and closes all its open reports", async () => {
    const first = await addReport(reporter.user.id, "hate", 2);
    const second = await addReport(admin.user.id, "other", 1);
    const res = await resolve(first, "hidden").expect(200);
    expect((res.body as AdminReport).id).toBe(first);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).status).toBe("hidden");
    const rows = await prisma.report.findMany({ where: { id: { in: [first, second] } } });
    expect(rows.every((r) => r.status === "closed" && r.action === "hidden")).toBe(true);
  });

  it("deleted deletes the character and other users' chats, and the report stays closed", async () => {
    const id = await addReport(reporter.user.id, "copied", 1);
    await prisma.chat.create({ data: { userId: reporter.user.id, characterId, title: "Mira" } });
    await resolve(id, "deleted").expect(200);
    expect(await prisma.character.findUnique({ where: { id: characterId } })).toBeNull();
    expect(await prisma.chat.count({ where: { userId: reporter.user.id } })).toBe(0);
    const row = await prisma.report.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "closed", action: "deleted", characterId: null, characterTitle: "Mira" });
  });

  it("gives 409 character_gone for an action on a deleted character, and none still closes it", async () => {
    const id = await addReport(reporter.user.id, "hate", 1);
    await prisma.character.delete({ where: { id: characterId } });
    const listed = await list(admin.cookie).expect(200);
    expect((listed.body as AdminReportList).reports[0]?.character).toBeNull();
    const res = await resolve(id, "hidden").expect(409);
    expect(res.body).toEqual({ error: "character_gone" });
    await resolve(id, "none").expect(200);
  });

  it("gives 404 for an unknown report and for an id that is not a UUID, and 400 for a bad action", async () => {
    await resolve("4b0c5bb4-2d6f-4f43-9d53-5d6e0a8f1c11", "none").expect(404);
    await resolve("not-a-uuid", "none").expect(404);
    const id = await addReport(reporter.user.id, "hate", 1);
    const bad = await resolve(id, "ban").expect(400);
    expect(bad.body).toEqual({ error: "invalid_request" });
  });
});
