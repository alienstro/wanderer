import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AdminReport, AdminReportList, CharacterComment, CommentListResponse } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("comment reports", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let creator: TestUser;
  let author: TestUser;
  let reporter: TestUser;
  let characterId: string;
  let commentId: string;

  const http = () => request(app.getHttpServer());
  const postComment = (cookie: string, body = "You are all fools.", id = characterId) =>
    http().post(`/characters/${id}/comments`).set("Origin", WEB_ORIGIN).set("Cookie", cookie).send({ body });
  const report = (id: string, cookie: string, body: unknown = { reason: "hate", note: "Rude." }) =>
    http()
      .post(`/comments/${id}/report`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", cookie)
      .send(body as object);
  const resolve = (id: string, action: string) =>
    http().post(`/admin/reports/${id}/resolve`).set("Origin", WEB_ORIGIN).set("Cookie", admin.cookie).send({ action });
  const comments = async () =>
    ((await http().get(`/characters/${characterId}/comments`).expect(200)).body as CommentListResponse).items;
  const reportId = (res: request.Response) => (res.body as { id: string }).id;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    admin = await userWithSession(app, 1, { role: "admin" });
    creator = await userWithSession(app, 2);
    author = await userWithSession(app, 3);
    reporter = await userWithSession(app, 4);
    characterId = await createCharacter(app, creator.cookie);
    commentId = ((await postComment(author.cookie).expect(201)).body as CharacterComment).id;
  });

  afterAll(async () => {
    // Leave no reports. A report row with two user keys stops a later user.deleteMany() in another file.
    await prisma.report.deleteMany();
    await app.close();
  });

  it("saves a report with the comment, the character, and the title", async () => {
    const res = await report(commentId, reporter.cookie).expect(201);
    const row = await prisma.report.findUniqueOrThrow({ where: { id: reportId(res) } });
    expect(row).toMatchObject({
      commentId,
      characterId,
      characterTitle: "Mira",
      reporterId: reporter.user.id,
      reason: "hate",
      note: "Rude.",
      status: "open",
    });
  });

  it("gives 400 invalid_request for a reason that does not apply to a comment", async () => {
    const res = await report(commentId, reporter.cookie, { reason: "copied" }).expect(400);
    expect(res.body).toEqual({ error: "invalid_request" });
  });

  it("gives 400 own_comment when the author reports their own comment", async () => {
    const res = await report(commentId, author.cookie).expect(400);
    expect(res.body).toEqual({ error: "own_comment" });
  });

  it("gives 409 for a second report of the comment, but accepts a report of the character and of another comment", async () => {
    await report(commentId, reporter.cookie).expect(201);
    expect((await report(commentId, reporter.cookie).expect(409)).body).toEqual({ error: "already_reported" });

    const other = ((await postComment(creator.cookie, "Thanks for playing!").expect(201)).body as CharacterComment).id;
    await report(other, reporter.cookie).expect(201);
    await http()
      .post(`/characters/${characterId}/report`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", reporter.cookie)
      .send({ reason: "hate" })
      .expect(201);
  });

  it("gives 404 for a deleted comment, a comment on a private character, and a bad ID", async () => {
    await http().delete(`/comments/${commentId}`).set("Origin", WEB_ORIGIN).set("Cookie", author.cookie).expect(204);
    const privateId = await createCharacter(app, creator.cookie, { title: "Private" });
    const hidden = ((await postComment(author.cookie, "Hi", privateId).expect(201)).body as CharacterComment).id;
    await prisma.character.update({ where: { id: privateId }, data: { isPublic: false } });
    for (const id of [commentId, hidden, "not-a-uuid"]) {
      expect((await report(id, reporter.cookie).expect(404)).body).toEqual({ error: "not_found" });
    }
  });

  it("shows the comment report in the admin list with the body and the author", async () => {
    await report(commentId, reporter.cookie).expect(201);
    const { reports } = (await http().get("/admin/reports").set("Cookie", admin.cookie).expect(200)).body as AdminReportList;
    expect(reports[0]).toMatchObject({
      reason: "hate",
      characterTitle: "Mira",
      reporterHandle: "user_4",
      comment: { id: commentId, body: "You are all fools.", authorId: author.user.id, authorHandle: "user_3", deleted: false },
    } satisfies Partial<AdminReport>);
  });

  it("gives comment null for a character report in the admin list", async () => {
    await http()
      .post(`/characters/${characterId}/report`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", reporter.cookie)
      .send({ reason: "hate" })
      .expect(201);
    const { reports } = (await http().get("/admin/reports").set("Cookie", admin.cookie).expect(200)).body as AdminReportList;
    expect(reports[0]!.comment).toBeNull();
  });

  it("hidden removes the comment from the page, takes 1 from the count, and closes the other reports of the comment", async () => {
    const first = reportId(await report(commentId, reporter.cookie).expect(201));
    const second = reportId(await report(commentId, creator.cookie).expect(201));
    const characterReport = reportId(
      await http()
        .post(`/characters/${characterId}/report`)
        .set("Origin", WEB_ORIGIN)
        .set("Cookie", reporter.cookie)
        .send({ reason: "hate" })
        .expect(201),
    );

    const res = await resolve(first, "hidden").expect(200);
    expect((res.body as AdminReport).comment).toMatchObject({ deleted: true });
    expect(await comments()).toEqual([]);
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(character).toMatchObject({ commentCount: 0, status: "published" });
    expect(await prisma.report.findUniqueOrThrow({ where: { id: second } })).toMatchObject({ status: "closed", action: "hidden" });
    expect(await prisma.report.findUniqueOrThrow({ where: { id: characterReport } })).toMatchObject({ status: "open" });
  });

  it("none closes the report and keeps the comment", async () => {
    const id = reportId(await report(commentId, reporter.cookie).expect(201));
    await resolve(id, "none").expect(200);
    expect((await comments()).map((item) => item.id)).toEqual([commentId]);
  });

  it("banned bans the comment author, deletes all their comments, and keeps the character", async () => {
    const otherId = await createCharacter(app, creator.cookie, { title: "Other" });
    await postComment(author.cookie, "Me again.", otherId).expect(201);
    const id = reportId(await report(commentId, reporter.cookie).expect(201));

    await resolve(id, "banned").expect(200);
    const banned = await prisma.user.findUniqueOrThrow({ where: { id: author.user.id } });
    expect(banned.bannedAt).not.toBeNull();
    expect(await prisma.characterComment.count({ where: { authorId: author.user.id, deletedAt: null } })).toBe(0);
    const counts = await prisma.character.findMany({ select: { commentCount: true, status: true } });
    expect(counts).toEqual([
      { commentCount: 0, status: "published" },
      { commentCount: 0, status: "published" },
    ]);
  });

  it("a ban of the creator from a character report keeps the comment reports of other users open", async () => {
    const commentReport = reportId(await report(commentId, reporter.cookie).expect(201));
    const characterReport = reportId(
      await http()
        .post(`/characters/${characterId}/report`)
        .set("Origin", WEB_ORIGIN)
        .set("Cookie", reporter.cookie)
        .send({ reason: "hate" })
        .expect(201),
    );
    await resolve(characterReport, "banned").expect(200);
    expect(await prisma.report.findUniqueOrThrow({ where: { id: commentReport } })).toMatchObject({ status: "open" });
  });

  describe("when the comment author deletes their account", () => {
    const deleteAccount = (cookie: string) =>
      http().delete("/me").set("Origin", WEB_ORIGIN).set("Cookie", cookie);
    const reportCharacter = (cookie: string) =>
      http().post(`/characters/${characterId}/report`).set("Origin", WEB_ORIGIN).set("Cookie", cookie).send({ reason: "hate" });

    it("deletes the account when the reporter reported the comment and the character", async () => {
      await report(commentId, reporter.cookie).expect(201);
      await reportCharacter(reporter.cookie).expect(201);
      await deleteAccount(author.cookie).expect(204);
    });

    it("keeps the report a comment report, and gives 409 comment_gone for an action", async () => {
      const id = reportId(await report(commentId, reporter.cookie).expect(201));
      await deleteAccount(author.cookie).expect(204);

      const { reports } = (await http().get("/admin/reports").set("Cookie", admin.cookie).expect(200)).body as AdminReportList;
      expect(reports[0]).toMatchObject({ id, target: "comment", comment: null });
      expect((await resolve(id, "hidden").expect(409)).body).toEqual({ error: "comment_gone" });
      expect((await resolve(id, "banned").expect(409)).body).toEqual({ error: "comment_gone" });
      const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
      expect(character.status).toBe("published");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: creator.user.id } })).bannedAt).toBeNull();
      await resolve(id, "none").expect(200);
    });
  });
});
