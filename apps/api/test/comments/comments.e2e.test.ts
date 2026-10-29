import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CharacterComment, CommentListResponse } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter, createOldAdultCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("character comments", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let creator: TestUser;
  let reader: TestUser;
  let characterId: string;

  const list = (id: string, cookie?: string, cursor?: string) => {
    const req = request(app.getHttpServer()).get(`/characters/${id}/comments`).query(cursor ? { cursor } : {});
    return cookie ? req.set("Cookie", cookie) : req;
  };
  const post = (id: string, cookie: string, body: unknown = { body: "Great scenario!" }) =>
    request(app.getHttpServer())
      .post(`/characters/${id}/comments`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", cookie)
      .send(body as object);
  const remove = (commentId: string, cookie: string) =>
    request(app.getHttpServer()).delete(`/comments/${commentId}`).set("Origin", WEB_ORIGIN).set("Cookie", cookie);
  const commentCount = async (id: string) =>
    (await prisma.character.findUniqueOrThrow({ where: { id } })).commentCount;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    creator = await userWithSession(app, 1);
    reader = await userWithSession(app, 2);
    characterId = await createCharacter(app, creator.cookie);
  });

  afterAll(async () => {
    await prisma.report.deleteMany();
    await app.close();
  });

  it("saves a comment, gives it back with the handle, and adds 1 to the count", async () => {
    const res = await post(characterId, reader.cookie).expect(201);
    expect(res.body).toMatchObject({
      body: "Great scenario!",
      authorHandle: "user_2",
      isOwn: true,
      canDelete: true,
    } satisfies Partial<CharacterComment>);
    expect(await commentCount(characterId)).toBe(1);

    const page = (await list(characterId).expect(200)).body as CommentListResponse;
    expect(page.count).toBe(1);
    expect(page.items.map((item) => item.body)).toEqual(["Great scenario!"]);
  });

  it("gives the comments to a visitor who is not signed in, with no delete right", async () => {
    await post(characterId, reader.cookie).expect(201);
    const page = (await list(characterId).expect(200)).body as CommentListResponse;
    expect(page.items[0]).toMatchObject({ isOwn: false, canDelete: false });
  });

  it("gives 401 to a visitor who posts", async () => {
    await request(app.getHttpServer())
      .post(`/characters/${characterId}/comments`)
      .set("Origin", WEB_ORIGIN)
      .send({ body: "Hi" })
      .expect(401);
  });

  it("gives 400 invalid_request for a body of 1,001 characters and saves nothing", async () => {
    const res = await post(characterId, reader.cookie, { body: "a".repeat(1_001) }).expect(400);
    expect(res.body).toEqual({ error: "invalid_request" });
    expect(await prisma.characterComment.count()).toBe(0);
  });

  it("keeps markup as plain text in the body", async () => {
    const body = "<script>alert(1)</script>";
    await post(characterId, reader.cookie, { body }).expect(201);
    const page = (await list(characterId).expect(200)).body as CommentListResponse;
    expect(page.items[0]!.body).toBe(body);
  });

  it("gives 429 to the sixth comment of one user in one minute", async () => {
    for (let n = 1; n <= 5; n++) {
      await post(characterId, reader.cookie, { body: `Comment ${n}` }).expect(201);
    }
    await post(characterId, reader.cookie, { body: "Comment 6" }).expect(429);
    await post(characterId, creator.cookie).expect(201);
  });

  it("gives the newest first, 20 on a page, and the next page after the cursor", async () => {
    const start = Date.now() - 60_000;
    await prisma.characterComment.createMany({
      data: Array.from({ length: 25 }, (_, n) => ({
        characterId,
        authorId: reader.user.id,
        body: `Comment ${n}`,
        createdAt: new Date(start + n * 1_000),
      })),
    });
    const first = (await list(characterId).expect(200)).body as CommentListResponse;
    expect(first.items).toHaveLength(20);
    expect(first.items[0]!.body).toBe("Comment 24");
    expect(first.nextCursor).not.toBeNull();

    const second = (await list(characterId, undefined, first.nextCursor!).expect(200)).body as CommentListResponse;
    expect(second.items.map((item) => item.body)).toEqual(["Comment 4", "Comment 3", "Comment 2", "Comment 1", "Comment 0"]);
    expect(second.nextCursor).toBeNull();
  });

  it("gives 400 invalid_cursor for a cursor that the API did not make", async () => {
    const res = await list(characterId, undefined, "not-a-cursor").expect(400);
    expect(res.body).toEqual({ error: "invalid_cursor" });
  });

  it("gives 404 for the comments of a private, a draft, and a hidden character to another user", async () => {
    const privateId = await createCharacter(app, creator.cookie, { title: "Private", isPublic: false });
    const draftId = await createCharacter(app, creator.cookie, { title: "Draft", publish: false });
    const hiddenId = await createCharacter(app, creator.cookie, { title: "Hidden" });
    await prisma.character.update({ where: { id: hiddenId }, data: { status: "hidden" } });
    for (const id of [privateId, draftId, hiddenId, "not-a-uuid"]) {
      expect((await list(id, reader.cookie).expect(404)).body).toEqual({ error: "not_found" });
      await post(id, reader.cookie).expect(404);
    }
    await list(privateId, creator.cookie).expect(200);
  });

  it("gives 404 not_found for the comments of an old 18+ character", async () => {
    const adultId = await createOldAdultCharacter(app, creator.cookie, { title: "Adult" });
    expect((await list(adultId, reader.cookie).expect(404)).body).toEqual({ error: "not_found" });
    await post(adultId, reader.cookie).expect(404);
  });

  describe("DELETE /comments/:id", () => {
    let commentId: string;

    beforeEach(async () => {
      commentId = ((await post(characterId, reader.cookie).expect(201)).body as CharacterComment).id;
    });

    it("lets the author delete the comment, hides it from the list, and takes 1 from the count", async () => {
      await remove(commentId, reader.cookie).expect(204);
      expect(await commentCount(characterId)).toBe(0);
      const page = (await list(characterId).expect(200)).body as CommentListResponse;
      expect(page).toMatchObject({ items: [], count: 0 });
      const row = await prisma.characterComment.findUniqueOrThrow({ where: { id: commentId } });
      expect(row.deletedAt).not.toBeNull();
    });

    it("lets the creator of the character delete the comment", async () => {
      const page = (await list(characterId, creator.cookie).expect(200)).body as CommentListResponse;
      expect(page.items[0]).toMatchObject({ isOwn: false, canDelete: true });
      await remove(commentId, creator.cookie).expect(204);
    });

    it("lets an admin delete the comment", async () => {
      const admin = await userWithSession(app, 3, { role: "admin" });
      await remove(commentId, admin.cookie).expect(204);
    });

    it("gives 403 forbidden to another user and keeps the comment", async () => {
      const other = await userWithSession(app, 4);
      expect((await remove(commentId, other.cookie).expect(403)).body).toEqual({ error: "forbidden" });
      expect(await commentCount(characterId)).toBe(1);
    });

    it("gives 404 for a second delete and does not take 1 from the count again", async () => {
      await remove(commentId, reader.cookie).expect(204);
      await remove(commentId, reader.cookie).expect(404);
      await remove("not-a-uuid", reader.cookie).expect(404);
      expect(await commentCount(characterId)).toBe(0);
    });
  });

  it("takes the comments of a deleted account from the count", async () => {
    await post(characterId, reader.cookie).expect(201);
    await request(app.getHttpServer()).delete("/me").set("Origin", WEB_ORIGIN).set("Cookie", reader.cookie).expect(204);
    expect(await commentCount(characterId)).toBe(0);
  });
});
