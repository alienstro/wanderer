import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FILE_STORAGE } from "../../src/files/file-storage.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { WEB_ORIGIN } from "../support/env.js";
import { cardText, pngImage, withTextChunk } from "../support/images.js";
import { MemoryStorage } from "../support/memory-storage.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("Tavern PNG import", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const storage = new MemoryStorage();
  let owner: TestUser;

  function importPng(data: Buffer) {
    return request(app.getHttpServer())
      .post("/characters/import-png")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", owner.cookie)
      .attach("file", data, "card.png");
  }

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: FILE_STORAGE, useValue: storage }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    storage.files.clear();
    owner = await userWithSession(app, 1);
  });

  afterAll(async () => {
    await app.close();
  });

  it("a card PNG gives 200 with the draft and an avatarFileId that GET /files/:id serves", async () => {
    const card = { spec: "chara_card_v2", data: { name: "Mira", description: "A mechanic.", first_mes: "Hi." } };
    const res = await importPng(withTextChunk(await pngImage(), "chara", cardText(card))).expect(200);

    expect(res.body).toEqual({
      draft: { title: "Mira", personality: "A mechanic.", openings: ["Hi."] },
      avatarFileId: expect.any(String),
    });
    await request(app.getHttpServer()).get(`/files/${res.body.avatarFileId}`).expect(200);
    expect(await prisma.character.count()).toBe(0);
  });

  it("a PNG with no card gives 400 no_character_card and stores no file", async () => {
    const res = await importPng(await pngImage()).expect(400);
    expect(res.body).toEqual({ error: "no_character_card" });
    expect(storage.files.size).toBe(0);
    expect(await prisma.file.count()).toBe(0);
  });
});
