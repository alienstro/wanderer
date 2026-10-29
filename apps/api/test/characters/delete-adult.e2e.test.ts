import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CharactersService } from "../../src/characters/characters.service.js";
import { FILE_STORAGE } from "../../src/files/file-storage.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { WEB_ORIGIN } from "../support/env.js";
import { MemoryStorage } from "../support/memory-storage.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("CharactersService.removeAdultCharacters", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let service: CharactersService;
  const storage = new MemoryStorage();
  let creator: TestUser;
  let reader: TestUser;
  let adultId: string;
  let normalId: string;

  /** Saves a file row and its bytes, as an upload does. */
  const saveFile = async (ownerId: string, path: string) => {
    await storage.save(path, Buffer.from("png"));
    return prisma.file.create({ data: { ownerId, path, mime: "image/png", size: 3, width: 1, height: 1 } });
  };

  /** Starts a chat of the reader and adds one scene image to it. */
  const chatWithScene = async (characterId: string, path: string) => {
    const res = await request(app.getHttpServer())
      .post("/chats")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", reader.cookie)
      .send({ characterId })
      .expect(201);
    const chatId = (res.body as { chat: { id: string } }).chat.id;
    const file = await saveFile(reader.user.id, path);
    await prisma.sceneImage.create({ data: { userId: reader.user.id, chatId, fileId: file.id, afterPosition: 0 } });
    return chatId;
  };

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: FILE_STORAGE, useValue: storage }] });
    prisma = app.get(PrismaService);
    service = app.get(CharactersService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    storage.files.clear();
    vi.restoreAllMocks();
    creator = await userWithSession(app, 1);
    reader = await userWithSession(app, 2);

    adultId = await createCharacter(app, creator.cookie, { title: "Lilith" });
    const avatar = await saveFile(creator.user.id, "avatars/lilith.png");
    await prisma.character.update({ where: { id: adultId }, data: { avatarFileId: avatar.id } });
    await chatWithScene(adultId, "scenes/lilith.png");
    // The chat starts before the mark, because the API does not start a chat with an 18+ character.
    await prisma.character.update({ where: { id: adultId }, data: { isAdult: true } });

    normalId = await createCharacter(app, creator.cookie, { title: "Mira" });
    await chatWithScene(normalId, "scenes/mira.png");
  });

  afterAll(async () => {
    await app.close();
  });

  it("a dry run gives the counts and deletes nothing", async () => {
    expect(await service.removeAdultCharacters({ dryRun: true })).toEqual({ characters: 1, chats: 1, files: 2 });
    expect(await prisma.character.count()).toBe(2);
    expect(await prisma.chat.count()).toBe(2);
    expect(storage.files.size).toBe(3);
  });

  it("deletes the 18+ character, its chats, its scene image and its avatar, with their bytes", async () => {
    expect(await service.removeAdultCharacters({ dryRun: false })).toEqual({ characters: 1, chats: 1, files: 2 });
    expect(await prisma.character.findUnique({ where: { id: adultId } })).toBeNull();
    expect(await prisma.chat.count({ where: { characterId: adultId } })).toBe(0);
    expect(await prisma.file.count({ where: { path: { in: ["avatars/lilith.png", "scenes/lilith.png"] } } })).toBe(0);
    expect([...storage.files.keys()]).toEqual(["scenes/mira.png"]);
  });

  it("keeps a normal character, its chat and its scene image", async () => {
    await service.removeAdultCharacters({ dryRun: false });
    expect(await prisma.character.findUnique({ where: { id: normalId } })).not.toBeNull();
    expect(await prisma.chat.count({ where: { characterId: normalId } })).toBe(1);
    expect(await prisma.file.count({ where: { path: "scenes/mira.png" } })).toBe(1);
  });

  it("a second run deletes nothing and gives no error", async () => {
    await service.removeAdultCharacters({ dryRun: false });
    expect(await service.removeAdultCharacters({ dryRun: false })).toEqual({ characters: 0, chats: 0, files: 0 });
    expect(await prisma.character.count()).toBe(1);
  });

  it("a storage error goes to the log, and the rows stay deleted", async () => {
    vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("disk full"));
    await expect(service.removeAdultCharacters({ dryRun: false })).resolves.toEqual({ characters: 1, chats: 1, files: 2 });
    expect(await prisma.character.findUnique({ where: { id: adultId } })).toBeNull();
    expect(await prisma.file.count({ where: { path: { in: ["avatars/lilith.png", "scenes/lilith.png"] } } })).toBe(0);
  });
});
