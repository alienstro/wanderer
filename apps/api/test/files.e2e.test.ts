import type { NestExpressApplication } from "@nestjs/platform-express";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FILE_STORAGE } from "../src/files/file-storage.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { WEB_ORIGIN } from "./support/env.js";
import { jpegWithGps, pngImage, pngWithFakeSize } from "./support/images.js";
import { MemoryStorage } from "./support/memory-storage.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("avatar upload and file serving", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const storage = new MemoryStorage();
  let owner: TestUser;

  function upload(data: Buffer, filename: string, cookie = owner.cookie, origin = WEB_ORIGIN) {
    return request(app.getHttpServer())
      .post("/files")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .attach("file", data, filename);
  }

  async function expectNothingStored() {
    expect(storage.files.size).toBe(0);
    expect(await prisma.file.count()).toBe(0);
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

  it("a PNG upload gives 201, and GET /files/:id gives a 600x800 WebP with no EXIF and the cache headers", async () => {
    const res = await upload(await pngImage(), "avatar.png").expect(201);
    expect(res.body).toEqual({ id: expect.any(String), url: `/files/${res.body.id}` });

    const file = await request(app.getHttpServer()).get(`/files/${res.body.id}`).buffer(true).expect(200);
    expect(file.headers["content-type"]).toBe("image/webp");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const meta = await sharp(file.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 600, height: 800 });
    expect(meta.exif).toBeUndefined();
  });

  it("a JPEG with EXIF GPS data comes back with no metadata", async () => {
    const jpeg = await jpegWithGps();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const res = await upload(jpeg, "photo.jpg").expect(201);

    const stored = storage.files.get(`${res.body.id}.webp`);
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("GET /files/:id gives 404 for an unknown ID", async () => {
    await request(app.getHttpServer()).get("/files/00000000-0000-4000-8000-000000000000").expect(404);
    await request(app.getHttpServer()).get("/files/not-a-uuid").expect(404);
  });

  it("GET /files/:id gives 404 when the row exists but the bytes are gone", async () => {
    const res = await upload(await pngImage(), "avatar.png").expect(201);
    storage.files.clear();
    await request(app.getHttpServer()).get(`/files/${res.body.id}`).expect(404);
  });

  it('a text file named avatar.png gives 400 { error: "invalid_image" } and stores nothing', async () => {
    const res = await upload(Buffer.from("hello, this is text"), "avatar.png").expect(400);
    expect(res.body).toEqual({ error: "invalid_image" });
    await expectNothingStored();
  });

  it("an SVG gives 400", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await upload(svg, "avatar.svg").expect(400);
    await expectNothingStored();
  });

  it("a 6 MB file gives 413", async () => {
    await upload(Buffer.alloc(6 * 1024 * 1024, 1), "big.png").expect(413);
    await expectNothingStored();
  });

  it("a 20000x20000 PNG gives 400", async () => {
    await upload(await pngWithFakeSize(20_000, 20_000), "huge.png").expect(400);
    await expectNothingStored();
  });

  it("an upload without a session gives 401", async () => {
    await upload(await pngImage(), "avatar.png", "").expect(401);
    await expectNothingStored();
  });

  it("an upload with Origin https://evil.example gives 403", async () => {
    await upload(await pngImage(), "avatar.png", owner.cookie, "https://evil.example").expect(403);
    await expectNothingStored();
  });
});
