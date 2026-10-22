import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FILE_STORAGE } from "../src/files/file-storage.js";
import { FilesService } from "../src/files/files.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { WEB_ORIGIN } from "./support/env.js";
import { pngImage } from "./support/images.js";
import { MemoryStorage } from "./support/memory-storage.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("DELETE /me", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const storage = new MemoryStorage();
  let broken = false;
  let user: TestUser;
  let other: TestUser;

  const http = () => request(app.getHttpServer());
  const remove = (cookie: string) => http().delete("/me").set("Origin", WEB_ORIGIN).set("Cookie", cookie);

  beforeAll(async () => {
    // The storage removes files normally, and fails only when a test sets `broken`.
    const remover = storage.remove.bind(storage);
    storage.remove = (key: string) => (broken ? Promise.reject(new Error("disk error")) : remover(key));
    app = await createTestApp({ overrides: [{ token: FILE_STORAGE, useValue: storage }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    broken = false;
    storage.files.clear();
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
    user = await userWithSession(app, 1);
    other = await userWithSession(app, 2);
  });

  afterAll(async () => {
    // Leave no reports. A report row with two user keys stops a later user.deleteMany() in another file.
    await prisma.report.deleteMany();
    await app.close();
  });

  /** Gives the user an avatar file, a character with it, a chat, and a proxy. */
  async function fillAccount(): Promise<string> {
    const avatar = await app.get(FilesService).saveAvatar(user.user.id, await pngImage());
    const characterId = await createCharacter(app, user.cookie, { avatarFileId: avatar.id });
    await prisma.chat.create({ data: { userId: user.user.id, characterId, title: "Mira" } });
    await http()
      .post("/proxies")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", user.cookie)
      .send({ name: "Main", baseUrl: "https://example.com/v1", model: "m", apiKey: "sk-test-1234" })
      .expect(201);
    return characterId;
  }

  it("gives 204, clears the cookie, and the old cookie then gets 401", async () => {
    const res = await remove(user.cookie).expect(204);
    expect(String(res.headers["set-cookie"])).toMatch(/wanderer_session=;|Expires=Thu, 01 Jan 1970/);
    await http().get("/me").set("Cookie", user.cookie).expect(401);
  });

  it("removes the user, the characters, chats, proxies, sessions, files, and the stored bytes", async () => {
    await fillAccount();
    expect(storage.files.size).toBe(1);
    await remove(user.cookie).expect(204);
    const id = user.user.id;
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.character.count({ where: { creatorId: id } })).toBe(0);
    expect(await prisma.chat.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.proxy.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.file.count({ where: { ownerId: id } })).toBe(0);
    expect(storage.files.size).toBe(0);
  });

  it("keeps the user's reports without the reporter, and reports about the user's characters", async () => {
    const otherCharacter = await createCharacter(app, other.cookie, { title: "Other" });
    const sent = await prisma.report.create({
      data: { characterId: otherCharacter, characterTitle: "Other", reporterId: user.user.id, reason: "hate" },
    });
    const characterId = await createCharacter(app, user.cookie, { title: "Mine" });
    const about = await prisma.report.create({
      data: { characterId, characterTitle: "Mine", reporterId: other.user.id, reason: "copied" },
    });
    await remove(user.cookie).expect(204);
    expect((await prisma.report.findUniqueOrThrow({ where: { id: sent.id } })).reporterId).toBeNull();
    const kept = await prisma.report.findUniqueOrThrow({ where: { id: about.id } });
    expect(kept).toMatchObject({ characterId: null, characterTitle: "Mine", reporterId: other.user.id });
  });

  it("still gives 204 when the storage cannot remove the bytes", async () => {
    await fillAccount();
    broken = true;
    await remove(user.cookie).expect(204);
    expect(await prisma.user.findUnique({ where: { id: user.user.id } })).toBeNull();
  });

  it("gives 401 to a visitor", async () => {
    await remove("").expect(401);
  });

  it("an admin who reported a character and resolved that report can delete their account", async () => {
    const admin = await userWithSession(app, 3, { role: "admin" });
    const characterId = await createCharacter(app, other.cookie);
    const report = await http()
      .post(`/characters/${characterId}/report`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", admin.cookie)
      .send({ reason: "hate" });
    expect(report.status).toBe(201);
    const resolve = await http()
      .post(`/admin/reports/${report.body.id}/resolve`)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", admin.cookie)
      .send({ action: "none" });
    expect(resolve.status).toBe(200);

    expect((await remove(admin.cookie)).status).toBe(204);
    const kept = await prisma.report.findUniqueOrThrow({ where: { id: report.body.id } });
    expect(kept).toMatchObject({ characterId, reporterId: null, resolvedById: null });
  });
});
