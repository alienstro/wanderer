import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("Tavern JSON import", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: TestUser;

  function post(path: string, body: string) {
    return request(app.getHttpServer())
      .post(path)
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", owner.cookie)
      .set("Content-Type", "application/json")
      .send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    owner = await userWithSession(app, 1);
  });

  afterAll(async () => {
    await app.close();
  });

  it("a V2 card JSON gives 200 with the draft and creates no character and no file", async () => {
    const card = { spec: "chara_card_v2", data: { name: "Mira", description: "A mechanic.", first_mes: "Hi." } };
    const res = await post("/characters/import-json", JSON.stringify(card)).expect(200);

    expect(res.body).toEqual({ draft: { title: "Mira", personality: "A mechanic.", openings: ["Hi."] } });
    expect(await prisma.character.count()).toBe(0);
    expect(await prisma.file.count()).toBe(0);
  });

  it("a JSON with no card fields gives 400 no_character_card", async () => {
    const res = await post("/characters/import-json", JSON.stringify({ hello: "world" })).expect(400);
    expect(res.body).toEqual({ error: "no_character_card" });
  });

  it("a body that is not valid JSON gives 400", async () => {
    await post("/characters/import-json", "{broken").expect(400);
  });

  it("a 1 MB card JSON is read, but a body over 2 MB gives 413", async () => {
    const card = { name: "Mira", description: "x".repeat(1024 * 1024) };
    await post("/characters/import-json", JSON.stringify(card)).expect(200);
    await post("/characters/import-json", JSON.stringify({ ...card, description: "x".repeat(3 * 1024 * 1024) })).expect(413);
  });

  it("the 2 MB limit is only for the import, so a 200 KB body on another route still gives 413", async () => {
    await post("/characters", JSON.stringify({ title: "Mira", bio: "x".repeat(200 * 1024) })).expect(413);
  });
});
